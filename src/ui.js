// src/ui.js
import * as THREE from 'three';

export class UIManager {
    constructor() {
      this.infoBox = document.createElement("div");
      this.infoBox.id = "uiContainer";
      this.infoBox.style.position = "absolute";
      this.infoBox.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
      this.infoBox.style.color = "white";
      this.infoBox.style.padding = "10px";
      this.infoBox.style.borderRadius = "5px";
      this.infoBox.style.display = "none";
      this.infoBox.addEventListener("mouseenter", (e) => e.stopPropagation());
      document.body.appendChild(this.infoBox);
    }
    
    showInfo(node, event) {
      this.infoBox.style.display = "block";
  
      const data = node.userData;
      const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
      let scanButtonHtml = data.id.match(ipRegex) && data.type !== "ship"
          ? `<button id="portScanButton">Scan Ports</button>` : "";
      let travelButtonHtml = data.type !== "ship"
          ? `<button id="travelButton">Travel</button>` : "";
  
      this.infoBox.innerHTML = `
          <strong>${data.label || "Unknown"}</strong><br>
          IP: ${data.id || "N/A"}<br>
          MAC: ${data.mac || "N/A"}<br>
          Role: ${data.role || "N/A"}<br>
          ${scanButtonHtml}
          ${travelButtonHtml}
          <div id="scanResults"></div>
      `;
  
      // Check if the selected node is a "port moon"
      if (node.userData.port) {
          this.infoBox.innerHTML += `
              <br><strong>Advanced Port Scans:</strong><br>
              <button id="bannerGrabButton">Banner Grab</button>
              <button id="cveLookupButton">Check CVE</button>
              <button id="reverseDNSButton">Reverse DNS</button>
              <button id="sslInfoButton">SSL Info</button>
              <div id="advancedScanResults"></div>
          `;
  
          setTimeout(() => {
              const scanResultsDiv = this.infoBox.querySelector("#advancedScanResults");
  
              document.getElementById("bannerGrabButton").addEventListener("click", async () => {
                  const response = await fetch(`http://localhost:5000/banner_grab?ip=${data.parentId}&port=${data.port}`);
                  const result = await response.json();
                  scanResultsDiv.innerHTML += `<br><strong>Banner:</strong> ${result.banner}`;
              });
  
              document.getElementById("cveLookupButton").addEventListener("click", async () => {
                  const response = await fetch(`http://localhost:5000/cve_lookup?service=${data.service}&version=${data.version}`);
                  const result = await response.json();
                  scanResultsDiv.innerHTML += `<br><strong>CVE Info:</strong> ${JSON.stringify(result.cve_data)}`;
              });
  
              document.getElementById("reverseDNSButton").addEventListener("click", async () => {
                  const response = await fetch(`http://localhost:5000/reverse_dns?ip=${data.parentId}`);
                  const result = await response.json();
                  scanResultsDiv.innerHTML += `<br><strong>Hostname:</strong> ${result.hostname}`;
              });
  
              document.getElementById("sslInfoButton").addEventListener("click", async () => {
                  const response = await fetch(`http://localhost:5000/ssl_info?ip=${data.parentId}&port=${data.port}`);
                  const result = await response.json();
                  scanResultsDiv.innerHTML += `<br><strong>SSL Certificate:</strong> ${JSON.stringify(result.ssl_data)}`;
              });
          }, 50);
      }
  
      if (!window.cameraController || !window.cameraController.camera) {
          console.error("Error: CameraController is missing or uninitialized.");
          return;
      }
  
      const camera = window.cameraController.camera;
  
      if (!node.position || !(node.position instanceof THREE.Vector3)) {
          console.error("Error: Node position is invalid or missing:", node);
          return;
      }
  
      // Convert 3D world position to 2D screen coordinates
      const nodePosition = new THREE.Vector3();
      node.getWorldPosition(nodePosition);
      nodePosition.project(camera);
  
      const screenX = (nodePosition.x + 1) / 2 * window.innerWidth;
      const screenY = (-nodePosition.y + 1) / 2 * window.innerHeight;
  
      this.infoBox.style.left = `${screenX + 20}px`;
      this.infoBox.style.top = `${screenY - 20}px`;
  
      this.infoBox.style.display = "block";
  
      if (scanButtonHtml) {
          setTimeout(() => {
              const portScanButton = document.getElementById("portScanButton");
              if (!portScanButton) {
                  console.error("Port scan button not found after rendering!");
                  return;
              }
  
              console.log("Port scan button found, adding event listener.");
  
              portScanButton.addEventListener("click", async () => {
                  try {
                      portScanButton.disabled = true;
                      portScanButton.innerText = "Scanning...";
  
                      if (window.eventsManager) {
                          window.eventsManager.resetSelection(true);
                      }
  
                      console.log(`Fetching: http://localhost:5000/scan_ports?ip=${data.id}`);
  
                      const response = await fetch(`http://localhost:5000/scan_ports?ip=${data.id}`);
                      const result = await response.json();
  
                      const scanResultsDiv = document.getElementById("scanResults");
                      scanResultsDiv.innerHTML = `<br><strong>Open Ports:</strong> ${result.ports.length > 0 ? result.ports.join(", ") : "None found"}`;
  
                      node.userData.scanResults = result;
  
                      if (result.ports.length > 0) {
                          node.material.color.set(0xffff00);
                      }
  
                      if (typeof window.nodesManager !== 'undefined') {
                          window.nodesManager.spawnChildNodes(node, result.ports);
                      }
                  } catch (err) {
                      console.error("Error scanning ports:", err);
                  } finally {
                      portScanButton.disabled = false;
                      portScanButton.innerText = "Scan Ports";
                  }
              });
          }, 100);
      }
  
      if (data.type === "external") {
          this.infoBox.innerHTML += `<button id="tracerouteButton">Run Traceroute</button>`;
          setTimeout(() => {
              document.getElementById("tracerouteButton").addEventListener("click", async () => {
                  await window.networkManager.fetchTracerouteData(data.id);
              });
          }, 50);
      }
  
      if (travelButtonHtml) {
          setTimeout(() => {
              const travelButton = document.getElementById("travelButton");
              travelButton.addEventListener("click", () => {
                  console.log("Travel button clicked! Target:", node.position);
  
                  const shipMesh = window.ship.getMesh();
                  const distance = shipMesh.position.distanceTo(node.position);
  
                  if (distance <= window.maxTravelDistance) {
                      console.log("Traveling to:", node.position);
                      window.ship.travelTo(node.position);
                      this.infoBox.innerHTML += `<br><em>Traveling...</em>`;
                  } else {
                      console.log("Target too far, cannot travel.");
                      this.infoBox.innerHTML += `<br><em>Target is too far to travel.</em>`;
                  }
              });
          }, 50);
      }
  
  
  
    }
    
    updateTravelStatus(statusMessage) {
        console.log("Updating travel status:", statusMessage);
        
        if (this.infoBox.style.display === "block") {
            this.infoBox.innerHTML = this.infoBox.innerHTML.replace(/<br><em>.*?<\/em>/g, "");
            this.infoBox.innerHTML += `<br><em>${statusMessage}</em>`;
        }
    
        // Reset node color when travel completes
        if (statusMessage === "Arrived!" && window.selectedNode) {
            const origColor = window.selectedNode.userData.originalColor;
            if (origColor) {
                window.selectedNode.material.color.setHex(origColor);
            }
            window.selectedNode = null; // Reset selection
        }
    }
    
      
          
    hideInfo() {
      this.infoBox.style.display = "none";
    }
  }
  