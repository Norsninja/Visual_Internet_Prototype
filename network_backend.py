#!/usr/bin/env python3
import subprocess
import socket
import requests
import re
import threading
import time
import platform
import logging
from flask import Flask, jsonify, request
from flask_cors import CORS

# Import Scapy functions
from scapy.all import IP, TCP, sr, send, ICMP, sr1

logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
CORS(app)

graph_data = {"nodes": [], "edges": []}
graph_lock = threading.Lock()

### CORE ENVIRONMENTAL SCANNERS ###

def get_local_ip():
    """Get the local IP address of this machine."""
    try:
        hostname = socket.gethostname()
        return socket.gethostbyname(hostname)
    except Exception as e:
        logging.error("Error getting local IP: %s", e)
        return "Unknown"

def get_gateway():
    """Find the default gateway (router)."""
    try:
        result = subprocess.run(["ipconfig"], capture_output=True, text=True, shell=True)
        match = re.search(r"Default Gateway\s*\.*?:\s*([\d\.]+)", result.stdout)
        return match.group(1) if match else "Unknown"
    except Exception as e:
        logging.error("Error getting gateway: %s", e)
        return "Unknown"

def run_arp_scan():
    """Run an ARP scan to detect local devices."""
    try:
        result = subprocess.run(["arp", "-a"], capture_output=True, text=True, shell=True)
        devices = []
        for line in result.stdout.split("\n"):
            match = re.search(r"(\d+\.\d+\.\d+\.\d+)", line)
            if match:
                devices.append(match.group(0))
        return devices
    except Exception as e:
        logging.error("Error running ARP scan: %s", e)
        return []

def run_traceroute(target="8.8.8.8"):
    """Run traceroute to detect external network hops."""
    try:
        result = subprocess.run(["tracert", target], capture_output=True, text=True, shell=True)
        hops = []
        for line in result.stdout.split("\n"):
            match = re.search(r"(\d+\.\d+\.\d+\.\d+)", line)
            if match:
                hops.append(match.group(0))
        return hops
    except Exception as e:
        logging.error("Error running traceroute: %s", e)
        return []

def get_asn_info(ip):
    """Fetch ASN and ISP information using the BGPView API."""
    try:
        if ip.startswith(("10.", "172.16.", "192.168.")):
            return "Private Network"
        url = f"https://api.bgpview.io/ip/{ip}"
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            asn = data["data"].get("asn", "Unknown ASN")
            isp = data["data"].get("isp", "Unknown ISP")
            return f"ASN {asn} ({isp})" if asn != "Unknown ASN" else "Unknown"
        else:
            return "Unknown"
    except Exception as e:
        logging.error("Error getting ASN info for %s: %s", ip, e)
        return "Unknown"

mac_cache = {}  # Store MAC addresses to avoid infinite retries

def get_mac(ip):
    """Retrieve the MAC address for a local network device with retry limits."""
    if not ip.startswith(("192.168.", "10.", "172.")):
        return "Unavailable (External Network)"

    # If we've already failed to find this MAC, return "Unknown" without retrying forever
    if ip in mac_cache and mac_cache[ip] is None:
        return "Unknown"

    try:
        result = subprocess.run(["arp", "-a"], capture_output=True, text=True, shell=True)
        for line in result.stdout.split("\n"):
            if ip in line:
                mac_match = re.search(r"([0-9A-Fa-f:-]{17})", line)
                if mac_match:
                    mac_cache[ip] = mac_match.group(0)  # Cache the result
                    return mac_match.group(0)

    except Exception as e:
        logging.error("Error getting MAC for %s: %s", ip, e)

    # If no MAC is found, cache the failure and return "Unknown"
    mac_cache[ip] = None
    return "Unknown"

### NEW PORT SCANNER USING SCAPY ###

def scapy_port_scan(ip, start_port=20, end_port=1024, timeout=2):
    """
    Perform a TCP SYN scan using Scapy on the given IP address.
    
    :param ip: Target IP address.
    :param start_port: Starting port number.
    :param end_port: Ending port number.
    :param timeout: Timeout in seconds for responses.
    :return: A list of open ports.
    """
    open_ports = []
    ports = list(range(start_port, end_port + 1))
    
    # Build the SYN packets for all ports
    packets = [IP(dst=ip)/TCP(dport=port, flags="S") for port in ports]
    
    logging.info("Starting Scapy scan on %s for ports %s to %s", ip, start_port, end_port)
    
    # Send the packets concurrently and collect responses
    answered, unanswered = sr(packets, timeout=timeout, verbose=0)
    
    # Process the responses: a SYN-ACK (flags=0x12) indicates an open port
    for sent, received in answered:
        tcp_layer = received.getlayer(TCP)
        if tcp_layer and tcp_layer.flags == 0x12:
            open_ports.append(sent.dport)
            # Send a RST packet to gracefully close the half-open connection
            send(IP(dst=ip)/TCP(dport=sent.dport, flags="R"), verbose=0)
    
    logging.info("Scapy scan complete on %s, open ports: %s", ip, open_ports)
    return open_ports

### ENVIRONMENTAL DATA UPDATER ###

def update_graph_data():
    """Continuously update the network graph data every 10 seconds."""
    global graph_data
    while True:
        local_ip = get_local_ip()
        gateway_ip = get_gateway()
        devices = run_arp_scan()
        traceroute_hops = run_traceroute()

        nodes = []
        edges = []


        # Add Router/Gateway Node
        nodes.append({
            "id": gateway_ip,
            "label": "Router/Gateway",
            "color": "orange",
            "mac": get_mac(gateway_ip),
            "role": "Router",
            "type": "router"
        })

        # Add Local Devices
        for device in devices:
            if device != local_ip and device != gateway_ip:
                nodes.append({
                    "id": device,
                    "label": "Local Device",
                    "color": "green",
                    "mac": get_mac(device),
                    "role": "Unknown Device",
                    "type": "device"
                })
                edges.append({"source": gateway_ip, "target": device})

        # Add External Nodes via traceroute
        prev_hop = gateway_ip
        for hop in traceroute_hops:
            if hop != gateway_ip:
                nodes.append({
                    "id": hop,
                    "label": get_asn_info(hop),
                    "color": "red",
                    "mac": "Unavailable (External)",
                    "role": "External Node",
                    "type": "external"
                })
                edges.append({"source": prev_hop, "target": hop})
                prev_hop = hop

        with graph_lock:
            graph_data = {"nodes": nodes, "edges": edges}

        time.sleep(10)

@app.route('/network', methods=['GET'])
def get_network():
    with graph_lock:
        return jsonify(graph_data)

@app.route('/scan_ports', methods=['GET'])
def scan_ports():
    ip = request.args.get('ip')
    if not ip:
        return jsonify({'error': 'Missing IP parameter'}), 400
    try:
        open_ports = scapy_port_scan(ip)
        return jsonify({'ports': open_ports})
    except Exception as e:
        logging.error("Error scanning ports for %s: %s", ip, e)
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    threading.Thread(target=update_graph_data, daemon=True).start()
    app.run(host='0.0.0.0', port=5000)
