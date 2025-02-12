# Visual Internet Prototype

## Overview
**Visual Internet Prototype** is a real-time network visualization tool that scans and maps devices, connections, and open ports on a local network using a **Flask backend** and a **Three.js frontend**. The backend performs **ARP scans, traceroutes, and port scans** to detect devices and their network interactions, exposing this data via a REST API. The frontend dynamically renders the network as a **3D space environment**, where:

- **Nodes** represent devices on the network.
- **Edges** represent connections between them.
- **Open ports** appear as orbiting moons around the devices.
- **A special red moon** highlights the external open port that connects the local network to the internet.

This system updates dynamically, ensuring **real-time awareness** of network topology and vulnerabilities. Users can **interactively explore connections** in an intuitive, immersive format.

## Vision
Beyond network visualization, the long-term goal is to develop a **game** where players can **fly around and discover the internet like explorers**. This includes:
- **Exploration of networks** as space-like environments.
- **PvP and PvE gameplay**, where users can interact, engage, and compete.
- **Cybersecurity mechanics**, allowing users to set up **defensive structures** for their local networks.
- **A realistic risk-reward system** that mirrors real-world network security challenges.
- **RTS-style Base Defense** Use gamified tools to visualize network security, making cybersecurity interactive and fun.

The first step is creating a **functioning proof of concept** in Python before considering a transition to **Unity** or **Unreal Engine**.

---

## Features
### Backend (Python & Flask)
- **ARP Scanning**: Detects all devices in the local network.
- **Traceroute**: Maps the external path from the network to the internet.
- **Port Scanning**: Identifies open ports for each detected device.
- **Traffic Capture**: Monitors packet traffic between nodes.
- **REST API**: Provides real-time data updates to the frontend.

### Frontend (Three.js)
- **3D Network Visualization**: Interactive rendering of network topology.
- **Dynamic Node and Edge Creation**: Updates in real time as new data arrives.
- **Traffic Animation**: Packets visually travel between nodes.
- **Ship Navigation**: Players can move a spaceship-like interface around the network.
- **UI Interaction**: Clickable nodes provide real-time information and allow network scanning.

---

## Installation & Setup
### Prerequisites
Coming soon

### Backend Setup
Coming soon

### Frontend Setup
Coming soon

## Project Structure
Coming soon

---

## Usage
- Start the **backend first**, then the **frontend**.
- Fly your **ship** around the network and explore connected devices by selecting nodes and traveling to them.
- Click on devices to get more info and **scan their open ports**.
- Watch real-time traffic flow and discover the **internet as a living space**.

---

## Roadmap
- [x] **Real-time network scanning**
- [x] **3D visualization of nodes & edges**
- [x] **Ship navigation and interaction**
- [ ] Implement **External Gateway Switching Portals**
- [ ] Split and Improve **Environment Scans & On Demand Scans**
- [ ] Improve/Expand **Environment: Dynamic Network Topology**
- [ ] Improve/Expand **Ship: Bridge with view of Universe**
- [ ] Expand cybersecurity mechanics for real network defense
- [ ] Consider transition to **Unity/Unreal** for full-scale game development
- [ ] Train **ML Agents** to live in Dynamic world. (Can agents run users defense? AI firewall,honeypots...)
- [ ] Introduce a stealth mechanic (VPN-based travel) to allow cloaked movement.
- [ ] Ultimately leading to an RTS style Base defense and Universe exploration game running on the existing internet

---

## Contribution
Want to help build the **Visual Internet Prototype**? Here’s how:
1. Fork the repository.
2. Create a feature branch (`git checkout -b feature-name`).
3. Commit your changes (`git commit -m 'Add feature'`).
4. Push to the branch (`git push origin feature-name`).
5. Submit a pull request!

---

## License
This project is open-source under the **MIT License**. Feel free to use, modify, and contribute!

---

## Contact
For questions, ideas, or contributions, feel free to reach out:


---

_"Exploring the internet like never before, one node at a time."_ 🌌
