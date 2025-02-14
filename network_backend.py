#!/usr/bin/env python3
import subprocess
import socket
import requests
import re
import threading
import time
import sqlite3
import logging
import ssl
import json
from flask import Flask, jsonify, request
from flask_cors import CORS
import netifaces
# Import Scapy functions
from scapy.all import IP, TCP, sr, send, ICMP, sr1, sniff
from collections import deque


logging.basicConfig(level=logging.INFO)
DB_PATH = 'graph.db'
app = Flask(__name__)
CORS(app)
persistent_nodes = {}   # key: node id, value: node dict (including a "last_seen" timestamp)
persistent_edges = {}
graph_data = {"nodes": [], "edges": []}
graph_lock = threading.Lock()
traffic_data = deque(maxlen=100)  # Store last 100 packets



# Global external target variable
external_target = "8.8.8.8"


# database init
def init_db(db_path=DB_PATH):
    """Initialize SQLite database for storing graph nodes, edges, and remote traceroute data."""
    retries = 3
    while retries:
        try:
            conn = sqlite3.connect(db_path, timeout=10, check_same_thread=False)
            c = conn.cursor()

            # ✅ Ensure nodes table exists
            c.execute('''
                CREATE TABLE IF NOT EXISTS nodes (
                    id TEXT PRIMARY KEY,
                    label TEXT,
                    color TEXT,
                    type TEXT,
                    mac TEXT,
                    role TEXT,
                    last_seen REAL,
                    extra_data TEXT
                )
            ''')

            # ✅ Ensure edges table exists
            c.execute('''
                CREATE TABLE IF NOT EXISTS edges (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source TEXT,
                    target TEXT,
                    label TEXT,
                    last_seen REAL,
                    extra_data TEXT,
                    UNIQUE(source, target)
                )
            ''')

            # ✅ Ensure traceroutes table exists for storing remote traceroute results
            c.execute('''
                CREATE TABLE IF NOT EXISTS traceroutes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    target_ip TEXT NOT NULL,
                    hops TEXT NOT NULL,  -- JSON array of hops
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            conn.commit()
            return conn
        except sqlite3.OperationalError as e:
            retries -= 1
            print(f"Database connection failed, retrying... ({3-retries}/3)")
            time.sleep(2)

    raise Exception("Failed to connect to SQLite database after 3 retries.")


def update_node(conn, node):
    c = conn.cursor()
    extra_data = json.dumps(node.get('extra_data', {}))
    now = node.get('last_seen', time.time())

    c.execute('''
        INSERT INTO nodes (id, label, color, type, mac, role, last_seen, extra_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            label=excluded.label,
            color=excluded.color,
            type=excluded.type,
            mac=excluded.mac,
            role=excluded.role,
            last_seen=?,
            extra_data=excluded.extra_data
    ''', (node['id'], node.get('label', ''), node.get('color', ''),
        node.get('type', ''), node.get('mac', ''), node.get('role', ''),
        now, extra_data, now))

    conn.commit()
def update_edge(conn, edge):
    """
    Update an edge entry if it exists, or insert it if not.
    'edge' is expected to be a dict with keys:
      - source, target, label, last_seen, and optionally extra_data (a dict)
    """
    c = conn.cursor()
    extra_data = json.dumps(edge.get('extra_data', {}))
    now = edge.get('last_seen', time.time())
    
    c.execute('''
        INSERT INTO edges (source, target, label, last_seen, extra_data)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(source, target) DO UPDATE SET
            label=excluded.label,
            last_seen=?,
            extra_data=excluded.extra_data
    ''', (edge['source'], edge['target'], edge.get('label', ''),
          now, extra_data, time.time()))
    conn.commit()

def initialize_graph(conn):
    """Ensure the database loads the external network and past remote traceroute data at startup."""
    try:
        with conn:
            c = conn.cursor()

            # ✅ Ensure `gateway_ip` is always assigned
            gateway_ip = get_gateway()
            if gateway_ip == "Unknown" or not gateway_ip:
                print("⚠️ Warning: Gateway IP not found, using default 192.168.1.1")
                gateway_ip = "192.168.1.1"

            # ✅ Ensure at least one node (router) exists
            c.execute("SELECT COUNT(*) FROM nodes")
            if c.fetchone()[0] == 0:
                print("⚠️ No nodes found in the database. Initializing default graph...")

                router_node = {
                    "id": gateway_ip,
                    "label": "Router/Gateway",
                    "color": "orange",
                    "mac": get_mac(gateway_ip),
                    "role": "Router",
                    "type": "router",
                    "last_seen": time.time(),
                    "extra_data": json.dumps({"open_external_port": None})
                }

                c.execute('''
                    INSERT INTO nodes (id, label, color, type, mac, role, last_seen, extra_data)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (router_node['id'], router_node['label'], router_node['color'], router_node['type'],
                      router_node['mac'], router_node['role'], router_node['last_seen'], router_node['extra_data']))

                print(f"✅ Added default node: {router_node['id']}")

            # ✅ Ensure at least one edge exists
            c.execute("SELECT COUNT(*) FROM edges")
            if c.fetchone()[0] == 0:
                print("⚠️ No edges found in the database. Initializing default edge...")

                c.execute('''
                    INSERT INTO edges (source, target, label, last_seen, extra_data)
                    VALUES (?, ?, ?, ?, ?)
                ''', (gateway_ip, gateway_ip, "Default Edge", time.time(), json.dumps({})))

                print(f"✅ Added default edge: {gateway_ip} -> {gateway_ip}")

            conn.commit()

            # ✅ **NEW FEATURE: Load all past remote traceroutes into the graph**
            print("🔄 Loading stored remote traceroute data...")
            c.execute("SELECT target_ip, hops FROM traceroutes ORDER BY timestamp DESC")
            past_traceroutes = c.fetchall()

            for target_ip, hops_json in past_traceroutes:
                hops = json.loads(hops_json)

                print(f"🔁 Restoring past traceroute for {target_ip}: {hops}")

                prev_hop = gateway_ip  # **Ensure prev_hop is always assigned**
                for hop in hops:
                    # ✅ **Skip Invalid `'*'` Hops**
                    if hop == "*":
                        print(f"⚠️ Skipping non-responding hop `*` in traceroute for {target_ip}")
                        continue  

                    # Add nodes from past traceroutes
                    node_dict = {
                        "id": hop,
                        "label": get_asn_info(hop),
                        "color": "red",
                        "mac": "Unavailable (External)",
                        "role": "External Node",
                        "type": "external",
                        "last_seen": time.time()
                    }
                    update_node(conn, node_dict)

                    # Add edges between traceroute hops
                    edge_dict = {
                        "source": prev_hop,
                        "target": hop,
                        "label": "traceroute hop",
                        "last_seen": time.time()
                    }
                    update_edge(conn, edge_dict)

                    prev_hop = hop  # ✅ Ensure `prev_hop` updates correctly

            print("✅ Past remote traceroute data loaded successfully.")
            conn.commit()

    except sqlite3.Error as e:
        print(f"❌ Database error during initialization: {e}")


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

def get_node_by_id(conn, node_id):
    """
    Fetch a single node from the 'nodes' table by ID.
    Returns a dict matching your 'node' structure or None if not found.
    """
    c = conn.cursor()
    c.execute("SELECT id, label, color, type, mac, role, last_seen, extra_data FROM nodes WHERE id = ?", (node_id,))
    row = c.fetchone()
    if row:
        node_id, label, color, ntype, mac, role, last_seen, extra_data = row
        node = {
            "id": node_id,
            "label": label,
            "color": color,
            "type": ntype,
            "mac": mac,
            "role": role,
            "last_seen": last_seen,
        }
        if extra_data:
            # Merge extra_data into the node dict so open_external_port appears at the top level.
            node.update(json.loads(extra_data))
        return node
    return None

def fetch_full_graph(conn):
    """
    Retrieve all nodes and edges from the database 
    and return them as a dict: {"nodes": [...], "edges": [...]}
    """
    c = conn.cursor()
    
    # Fetch nodes
    c.execute("SELECT id, label, color, type, mac, role, last_seen, extra_data FROM nodes")
    node_rows = c.fetchall()
    nodes = []
    for row in node_rows:
        node_id, label, color, ntype, mac, role, last_seen, extra_data = row
        node = {
            "id": node_id,
            "label": label,
            "color": color,
            "type": ntype,
            "mac": mac,
            "role": role,
            "last_seen": last_seen,
        }
        if extra_data:
            node.update(json.loads(extra_data))
        nodes.append(node)

    # Fetch edges
    c.execute("SELECT source, target, label, last_seen, extra_data FROM edges")
    edge_rows = c.fetchall()
    edges = []
    for row in edge_rows:
        source, target, label, last_seen, extra_data = row
        edge = {
            "source": source,
            "target": target,
            "label": label,
            "last_seen": last_seen,
        }
        if extra_data:
            edge.update(json.loads(extra_data))
        edges.append(edge)
    
    return {"nodes": nodes, "edges": edges}


def update_graph_data():
    """Continuously update the persistent network graph data every 10 seconds."""
    while True:
        # Open a new DB connection for each loop (simple approach)
        conn = sqlite3.connect(DB_PATH)
        
        local_ip = get_local_ip()
        gateway_ip = get_gateway()

        if gateway_ip == "Unknown":
            logging.error("Gateway IP could not be determined, skipping update.")
            conn.close()
            time.sleep(10)
            continue

        devices = run_arp_scan()
        traceroute_hops = run_traceroute(target=external_target)
        now = time.time()

        # 1. Look up the router node in the DB instead of persistent_nodes
        # Detect and store the router's external open port:
        c = conn.cursor()
        c.execute("SELECT extra_data FROM nodes WHERE id = ?", (gateway_ip,))
        result = c.fetchone()
        existing_extra = json.loads(result[0]) if result and result[0] else {}
        existing_external_port = existing_extra.get("open_external_port")

        if existing_external_port is None:
            external_ports = scapy_port_scan(gateway_ip, start_port=20, end_port=1024)
            external_open_port = external_ports[0] if external_ports else None
        else:
            external_open_port = existing_external_port  # Keep the previously detected port

        router_node = {
            "id": gateway_ip,
            "label": "Router/Gateway",
            "color": "orange",
            "mac": get_mac(gateway_ip),
            "role": "Router",
            "type": "router",
            "last_seen": now,
            "extra_data": {"open_external_port": external_open_port}
        }

        update_node(conn, router_node)

        logging.info(f"Router node updated: {router_node}")

        # We'll track the current batch of discovered nodes/edges
        # just for clarity (not strictly needed)
        current_nodes = {}
        current_edges = {}

        # 4. Process local devices
        local_subnet = get_local_subnet()
        for device in devices:
            if device not in (local_ip, gateway_ip):
                is_local = local_subnet and device.startswith(local_subnet)
                node_dict = {
                    "id": device,
                    "label": "Local Device" if is_local else "External Device",
                    "color": "#0099FF" if is_local else "red",
                    "mac": get_mac(device),
                    "role": "Unknown Device" if is_local else "External Node",
                    "type": "device" if is_local else "external",
                    "last_seen": now,
                }
                update_node(conn, node_dict)
                current_nodes[device] = node_dict

                # Edge from gateway to this device
                edge_dict = {
                    "source": gateway_ip,
                    "target": device,
                    "label": "local connection",
                    "last_seen": now,
                }
                update_edge(conn, edge_dict)
                current_edges[(gateway_ip, device)] = edge_dict

        # 5. Process external nodes via traceroute
        prev_hop = gateway_ip
        for hop in traceroute_hops:
            if hop != gateway_ip:
                # For external hops, we can fetch the ASN info for the label
                node_dict = {
                    "id": hop,
                    "label": get_asn_info(hop),
                    "color": "red",
                    "mac": "Unavailable (External)",
                    "role": "External Node",
                    "type": "external",
                    "last_seen": now
                }
                update_node(conn, node_dict)
                current_nodes[hop] = node_dict

                edge_dict = {
                    "source": prev_hop,
                    "target": hop,
                    "label": "traceroute hop",
                    "last_seen": now,
                }
                update_edge(conn, edge_dict)
                current_edges[(prev_hop, hop)] = edge_dict

                prev_hop = hop

        # 6. Optionally, refresh our global in-memory graph_data from the DB
        #    so that the /network endpoint can quickly return it
        with graph_lock:
            updated_graph = fetch_full_graph(conn)
            graph_data["nodes"] = updated_graph["nodes"]
            graph_data["edges"] = updated_graph["edges"]

        conn.close()
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
# remote tools
REMOTE_SERVER = "https://visual-internet-prototype-remote.fly.dev/"

def request_remote_traceroute(target_ip):
    try:
        response = requests.get(f"{REMOTE_SERVER}/traceroute", params={"target": target_ip}, timeout=10)
        return response.json()
    except Exception as e:
        print(f"Error contacting remote traceroute server: {e}")
        return {"error": str(e)}

def store_traceroute(conn, target_ip, hops):
    """Store a traceroute result in the database and ensure graph connectivity."""
    try:
        with conn:
            c = conn.cursor()

            # ✅ Ensure `traceroutes` table exists
            c.execute('''
                CREATE TABLE IF NOT EXISTS traceroutes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    target_ip TEXT NOT NULL,
                    hops TEXT NOT NULL,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')

            # ✅ **Filter out `'*'` before storing the hops**
            filtered_hops = [hop for hop in hops if hop != "*"]
            if not filtered_hops:
                print(f"⚠️ No valid hops for {target_ip}, skipping storage.")
                return  # **Do not store empty traceroutes**

            # ✅ Store the cleaned traceroute data
            c.execute("INSERT INTO traceroutes (target_ip, hops) VALUES (?, ?)", 
                      (target_ip, json.dumps(filtered_hops)))

            # ✅ Ensure each valid hop exists in the `nodes` table
            for hop in filtered_hops:
                c.execute('''
                    INSERT INTO nodes (id, label, color, type, last_seen)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen
                ''', (hop, f"Traceroute Hop {hop}", "red", "external", time.time()))

            # ✅ Create edges between valid hops
            prev_hop = target_ip  # Start from target device
            for hop in filtered_hops:
                c.execute('''
                    INSERT INTO edges (source, target, label, last_seen)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(source, target) DO UPDATE SET last_seen=excluded.last_seen
                ''', (prev_hop, hop, "traceroute hop", time.time()))
                prev_hop = hop  # Move to next hop

            print(f"✅ Stored filtered traceroute for {target_ip}: {filtered_hops}")
            conn.commit()

    except sqlite3.Error as e:
        print(f"Database error: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")



def get_cached_traceroute(conn, target_ip):
    """Retrieve the most recent traceroute from the database."""
    c = conn.cursor()
    c.execute("SELECT hops FROM traceroutes WHERE target_ip = ? ORDER BY timestamp DESC LIMIT 1", (target_ip,))
    result = c.fetchone()
    return json.loads(result[0]) if result else None

@app.route('/remote_traceroute', methods=['GET'])
def remote_traceroute():
    """Fetch remote traceroute from cache or request a fresh one."""
    target = request.args.get("target")
    if not target:
        return jsonify({"error": "Missing target IP"}), 400

    conn = sqlite3.connect(DB_PATH)
    cached_hops = get_cached_traceroute(conn, target)
    if cached_hops:
        conn.close()
        return jsonify({"target": target, "hops": cached_hops, "cached": True})

    # Run remote traceroute if not cached
    hops = request_remote_traceroute(target).get("hops", [])
    if hops:
        store_traceroute(conn, target, hops)
    conn.close()

    return jsonify({"target": target, "hops": hops, "cached": False})

#Normal endpoints
@app.route('/full_graph', methods=['GET'])
def full_graph():
    """Return the entire graph structure (nodes + edges)."""
    conn = sqlite3.connect(DB_PATH)
    graph = fetch_full_graph(conn)  # Fetch nodes and edges from DB
    conn.close()
    
    return jsonify(graph)  # Ensure it returns valid JSON

@app.route('/network', methods=['GET'])
def get_network():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    radius = request.args.get('radius', default=500, type=int)

    # Query only nearby nodes (e.g. seen in the last 10 minutes)
    c.execute(f"SELECT * FROM nodes WHERE last_seen > {time.time() - 3600}")
    nodes = []
    for row in c.fetchall():
        nodeObj = {
            "id": row[0],
            "label": row[1],
            "color": row[2],
            "type": row[3],
            "mac": row[4],
            "role": row[5],
            "last_seen": row[6],
        }
        if row[7]:
            extra = json.loads(row[7])
            # Merge extra_data so open_external_port becomes a top-level property
            nodeObj.update(extra)
        nodes.append(nodeObj)

    c.execute("SELECT source, target, label, last_seen, extra_data FROM edges")
    edges = []
    for row in c.fetchall():
        edgeObj = {
            "source": row[0],
            "target": row[1],
            "label": row[2],
            "last_seen": row[3],
        }
        if row[4]:
            extra = json.loads(row[4])
            edgeObj.update(extra)
        edges.append(edgeObj)
    
    conn.close()
    return jsonify({"nodes": nodes, "edges": edges})




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
    conn = init_db()
    initialize_graph(conn)  # Ensure database is initialized
    conn.close()

    threading.Thread(target=start_packet_capture, daemon=True).start()
    threading.Thread(target=update_graph_data, daemon=True).start()
    app.run(host='0.0.0.0', port=5000)

