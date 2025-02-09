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

def get_mac(ip):
    """Retrieve the MAC address for a local network device."""
    if not ip.startswith(("192.168.", "10.", "172.")):  
        return "Unavailable (External Network)"
    try:
        result = subprocess.run(["arp", "-a"], capture_output=True, text=True, shell=True)
        for line in result.stdout.split("\n"):
            if ip in line:
                mac_match = re.search(r"([0-9A-Fa-f:-]{17})", line)
                return mac_match.group(0) if mac_match else "Unknown"
    except Exception as e:
        logging.error("Error getting MAC for %s: %s", ip, e)
    return "Unknown"

### PORT SCANNER ###
def port_scan(ip, start_port=20, end_port=1024, timeout=0.5):
    """Simple port scanner for a given IP address."""
    open_ports = []
    for port in range(start_port, end_port + 1):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.settimeout(timeout)
                result = sock.connect_ex((ip, port))
                if result == 0:
                    open_ports.append(port)
        except Exception as e:
            logging.error("Error scanning port %s on %s: %s", port, ip, e)
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

        # Add Main "Ship" Node
        nodes.append({
            "id": "My Ship",
            "label": "Explorer Ship",
            "color": "blue",
            "mac": "N/A",
            "role": "User Device",
            "type": "ship"
        })

        # Add Router/Gateway Node
        nodes.append({
            "id": gateway_ip,
            "label": "Router/Gateway",
            "color": "orange",
            "mac": get_mac(gateway_ip),
            "role": "Router",
            "type": "router"
        })
        edges.append({"source": "My Ship", "target": gateway_ip})

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

        # Add External Nodes
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
    open_ports = port_scan(ip)
    return jsonify({'ports': open_ports})

if __name__ == '__main__':
    threading.Thread(target=update_graph_data, daemon=True).start()
    app.run(host='0.0.0.0', port=5000)
