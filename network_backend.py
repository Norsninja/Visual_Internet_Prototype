#!/usr/bin/env python3
import subprocess
import socket
import requests
import re
import threading
import time
import platform
import logging
import ssl
from flask import Flask, jsonify, request
from flask_cors import CORS
import netifaces
# Import Scapy functions
from scapy.all import IP, TCP, sr, send, ICMP, sr1, sniff
from collections import deque


logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
CORS(app)
persistent_nodes = {}   # key: node id, value: node dict (including a "last_seen" timestamp)
persistent_edges = {}
graph_data = {"nodes": [], "edges": []}
graph_lock = threading.Lock()
traffic_data = deque(maxlen=100)  # Store last 100 packets
# Global external target variable
external_target = "8.8.8.8"
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
    """Retrieve the IPv4 default gateway using netifaces."""
    try:
        gateways = netifaces.gateways()

        # Ensure the default IPv4 gateway exists
        if 'default' in gateways and netifaces.AF_INET in gateways['default']:
            default_gateway = gateways['default'][netifaces.AF_INET][0]
            logging.info(f"Detected IPv4 Gateway: {default_gateway}")
            return default_gateway

        logging.warning("No valid IPv4 gateway detected.")
        return "Unknown"

    except Exception as e:
        logging.error(f"Error getting gateway: {e}")
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
def get_local_subnet():
    try:
        iface = netifaces.gateways()['default'][netifaces.AF_INET][1]
        addr_info = netifaces.ifaddresses(iface)[netifaces.AF_INET][0]
        local_subnet = addr_info['addr'].rsplit('.', 1)[0] + '.'  # e.g., "192.168.1."
        return local_subnet
    except Exception as e:
        logging.error("Could not determine local subnet: %s", e)
        return None
    
def packet_callback(packet):
    """Capture network traffic and store relevant packet details."""
    if IP in packet:
        src = packet[IP].src
        dst = packet[IP].dst
        proto = packet.proto
        size = len(packet)

        traffic_data.append({"src": src, "dst": dst, "proto": proto, "size": size})

# Start a background thread to capture packets
def start_packet_capture():
    sniff(prn=packet_callback, store=False)
# Advanced Scans
def get_ssl_info(ip, port=443):
    try:
        context = ssl.create_default_context()
        with socket.create_connection((ip, port), timeout=3) as sock:
            with context.wrap_socket(sock, server_hostname=ip) as ssock:
                cert = ssock.getpeercert()
                return cert
    except:
        return "No SSL or Failed to Retrieve"
    
def reverse_dns_lookup(ip):
    try:
        return socket.gethostbyaddr(ip)[0]
    except socket.herror:
        return "Unknown"
def check_cve(service_name, version):
    url = f"https://services.nvd.nist.gov/rest/json/cves/1.0?keyword={service_name}%20{version}"
    try:
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            return response.json()
    except:
        return "Unknown"    
def grab_banner(ip, port):
    try:
        with socket.create_connection((ip, port), timeout=3) as s:
            s.sendall(b"GET / HTTP/1.1\r\n\r\n")  # Example request for HTTP services
            return s.recv(1024).decode(errors="ignore")
    except Exception:
        return "Unknown"
### ENVIRONMENTAL DATA UPDATER ###

def update_graph_data():
    """Continuously update the persistent network graph data every 10 seconds."""
    global graph_data
    while True:
        local_ip = get_local_ip()
        gateway_ip = get_gateway()

        if gateway_ip == "Unknown":
            logging.error("Gateway IP could not be determined, skipping update.")
            time.sleep(10)
            continue

        devices = run_arp_scan()
        traceroute_hops = run_traceroute(target=external_target)
        now = time.time()

        # Check if the router node already exists
        existing_router = persistent_nodes.get(gateway_ip)

        # Scan for open ports only if the router node does not already have an open port
        external_open_port = existing_router.get("open_external_port") if existing_router else None
        if external_open_port is None:  # Only scan if we haven't already detected an external port
            external_ports = scapy_port_scan(gateway_ip, start_port=20, end_port=1024)
            external_open_port = external_ports[0] if external_ports else None

        # If the router node exists, update it instead of recreating
        if existing_router:
            existing_router["last_seen"] = now
            existing_router["open_external_port"] = external_open_port
            logging.info(f"Updated existing router node: {existing_router}")
        else:
            # Create a new router node only if it does not exist
            router_node = {
                "id": gateway_ip,
                "label": "Router/Gateway",
                "color": "orange",
                "mac": get_mac(gateway_ip),
                "role": "Router",
                "type": "router",
                "last_seen": now,
                "open_external_port": external_open_port  # Store the open external port
            }
            logging.info(f"Created new router node: {router_node}")
            persistent_nodes[gateway_ip] = router_node

        current_nodes = {gateway_ip: persistent_nodes[gateway_ip]}  # Ensure persistence
        current_edges = {}

        # Process local devices
        local_subnet = get_local_subnet()
        for device in devices:
            if device != local_ip and device != gateway_ip:
                existing_node = persistent_nodes.get(device, {})
                last_seen = now if not existing_node else existing_node.get("last_seen", now)

                is_local = local_subnet and device.startswith(local_subnet)

                current_nodes[device] = {
                    "id": device,
                    "label": "Local Device" if is_local else "External Device",
                    "color": "#0099FF" if is_local else "red",
                    "mac": get_mac(device),
                    "role": "Unknown Device" if is_local else "External Node",
                    "type": "device" if is_local else "external",
                    "last_seen": last_seen,
                }
                current_edges[(gateway_ip, device)] = {"source": gateway_ip, "target": device}

        # Process external nodes via traceroute
        prev_hop = gateway_ip
        for hop in traceroute_hops:
            if hop != gateway_ip:
                existing_node = persistent_nodes.get(hop, {})
                last_seen = now if not existing_node else existing_node.get("last_seen", now)

                current_nodes[hop] = {
                    "id": hop,
                    "label": get_asn_info(hop),
                    "color": "red",
                    "mac": "Unavailable (External)",
                    "role": "External Node",
                    "type": "external",
                    "last_seen": last_seen,
                }
                current_edges[(prev_hop, hop)] = {"source": prev_hop, "target": hop}
                prev_hop = hop

        with graph_lock:
            # Persist nodes without re-creating
            persistent_nodes.update(current_nodes)
            persistent_edges.update(current_edges)

            # Update graph data
            graph_data["nodes"] = list(persistent_nodes.values())
            graph_data["edges"] = list(persistent_edges.values())

        time.sleep(10)

@app.route('/banner_grab', methods=['GET'])
def banner_grab():
    ip = request.args.get('ip')
    port = request.args.get('port', type=int)
    if not ip or not port:
        return jsonify({'error': 'Missing IP or Port parameter'}), 400
    return jsonify({'port': port, 'banner': grab_banner(ip, port)})
@app.route('/cve_lookup', methods=['GET'])
def cve_lookup():
    service = request.args.get('service')
    version = request.args.get('version')
    if not service or not version:
        return jsonify({'error': 'Missing service or version parameters'}), 400
    return jsonify({'cve_data': check_cve(service, version)})
@app.route('/reverse_dns', methods=['GET'])
def reverse_dns():
    ip = request.args.get('ip')
    if not ip:
        return jsonify({'error': 'Missing IP parameter'}), 400
    return jsonify({'hostname': reverse_dns_lookup(ip)})
@app.route('/ssl_info', methods=['GET'])
def ssl_info():
    ip = request.args.get('ip')
    port = request.args.get('port', type=int)
    if not ip or not port:
        return jsonify({'error': 'Missing IP or Port parameter'}), 400
    return jsonify({'ssl_data': get_ssl_info(ip, port)})


@app.route('/network', methods=['GET'])
def get_network():
    with graph_lock:
        logging.info("Sending Network Graph: Nodes=%d, Edges=%d", len(graph_data["nodes"]), len(graph_data["edges"]))
        return jsonify(graph_data)


@app.route('/scan_ports', methods=['GET'])
def scan_ports():
    ip = request.args.get('ip')
    if not ip:
        return jsonify({'error': 'Missing IP parameter'}), 400
    try:
        open_ports = scapy_port_scan(ip)

        # Store the open ports in persistent_nodes
        if ip in persistent_nodes:
            persistent_nodes[ip]["open_ports"] = open_ports
        else:
            persistent_nodes[ip] = {"id": ip, "open_ports": open_ports}

        return jsonify({
            'ports': open_ports,
            'message': 'Scan complete. Select a port to perform advanced scans.'
        })
    except Exception as e:
        logging.error("Error scanning ports for %s: %s", ip, e)
        return jsonify({'error': str(e)}), 500


@app.route('/traffic', methods=['GET'])
def get_traffic():
    """Expose captured packet data via API."""
    return jsonify(list(traffic_data))

@app.route('/set_external_target', methods=['POST'])
def set_external_target():
    global external_target
    data = request.get_json()  # Expecting a JSON payload like {"target": "1.1.1.1"}
    new_target = data.get("target")
    # Basic validation: ensure it's a valid IPv4 address (you can improve this validation if needed)
    if new_target and re.match(r"^(?:\d{1,3}\.){3}\d{1,3}$", new_target):
        external_target = new_target
        logging.info(f"External target updated to: {external_target}")
        return jsonify({"status": "success", "target": external_target}), 200
    else:
        return jsonify({"status": "error", "message": "Invalid IP address provided"}), 400
    
if __name__ == '__main__':
    threading.Thread(target=start_packet_capture, daemon=True).start()
    threading.Thread(target=update_graph_data, daemon=True).start()
    app.run(host='0.0.0.0', port=5000)
