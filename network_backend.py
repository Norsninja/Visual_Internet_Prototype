#!/usr/bin/env python3
import networkx as nx
import subprocess
import socket
import requests
import re
import threading
import time
from flask import Flask, jsonify
from flask_cors import CORS


app = Flask(__name__)
CORS(app)

# Global graph data in JSON-serializable format
graph_data = {"nodes": [], "edges": []}

def get_local_ip():
    """Get the local IP address of this machine."""
    hostname = socket.gethostname()
    return socket.gethostbyname(hostname)

def get_gateway():
    """Find the default gateway (router). Adjust the command for non-Windows systems."""
    result = subprocess.run(["ipconfig"], capture_output=True, text=True, shell=True)
    match = re.search(r"Default Gateway.*?: (\d+\.\d+\.\d+\.\d+)", result.stdout)
    return match.group(1) if match else "Unknown"

def run_arp_scan():
    """Run an ARP scan to detect local devices."""
    result = subprocess.run(["arp", "-a"], capture_output=True, text=True, shell=True)
    devices = []
    for line in result.stdout.split("\n"):
        match = re.search(r"(\d+\.\d+\.\d+\.\d+)", line)
        if match:
            devices.append(match.group(0))
    return devices

def run_traceroute(target):
    """Run traceroute (tracert on Windows) to collect external network hops."""
    result = subprocess.run(["tracert", target], capture_output=True, text=True, shell=True)
    hops = []
    for line in result.stdout.split("\n"):
        match = re.search(r"(\d+\.\d+\.\d+\.\d+)", line)
        if match:
            hops.append(match.group(0))
    return hops

def get_asn_info(ip):
    """Fetch ASN and ISP information using the BGPView API."""
    try:
        # Mark private IP addresses as such
        if ip.startswith(("10.", "172.16.", "192.168.")):
            return "Private Network"
        url = f"https://api.bgpview.io/ip/{ip}"
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            asn = data["data"].get("asn", "Unknown ASN")
            isp = data["data"].get("isp", "Unknown ISP")
            return f"{asn} ({isp})"
    except Exception as e:
        print(f"Error fetching ASN info for {ip}: {e}")
    return "Unknown"

def update_graph_data():
    """Continuously update the network graph data every 10 seconds."""
    global graph_data
    while True:
        local_ip = get_local_ip()
        gateway_ip = get_gateway()
        devices = run_arp_scan()
        traceroute_hops = run_traceroute("8.8.8.8")
        
        nodes = []
        edges = []
        
        # Add main "ship" node (your computer)
        nodes.append({"id": "My Ship", "label": "Explorer Ship", "color": "blue"})
        
        # Add router/gateway node and connect to the ship
        nodes.append({"id": gateway_ip, "label": "Router/Gateway", "color": "orange"})
        edges.append({"source": "My Ship", "target": gateway_ip})
        
        # Add local devices
        for device in devices:
            if device != local_ip and device != gateway_ip:
                nodes.append({"id": device, "label": "Local Device", "color": "green"})
                edges.append({"source": gateway_ip, "target": device})
        
        # Add traceroute hops for external network paths
        prev_hop = gateway_ip
        for hop in traceroute_hops:
            if hop != gateway_ip:
                asn_info = get_asn_info(hop)
                nodes.append({"id": hop, "label": asn_info if asn_info else "Unknown", "color": "red"})
                edges.append({"source": prev_hop, "target": hop})
                prev_hop = hop
        
        # Deduplicate nodes (using node "id" as key)
        unique_nodes = {}
        for node in nodes:
            unique_nodes[node["id"]] = node
        nodes = list(unique_nodes.values())
        
        # Update the global graph data
        graph_data = {"nodes": nodes, "edges": edges}
        
        # Debug print (optional)
        print("Updated network graph:", graph_data)
        
        # Wait 10 seconds before the next update
        time.sleep(10)

@app.route('/network', methods=['GET'])
def get_network():
    """Return the latest network graph as JSON."""
    return jsonify(graph_data)

if __name__ == '__main__':
    # Start the background thread to update network data
    updater_thread = threading.Thread(target=update_graph_data, daemon=True)
    updater_thread.start()
    # Run the Flask web server
    app.run(host='0.0.0.0', port=5000)
