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
    
            // ** Persist Advanced Scan Results **
            if (data.advancedScanResults) {
                const scanResultsDiv = this.infoBox.querySelector("#advancedScanResults");
                scanResultsDiv.innerHTML = data.advancedScanResults;
            }
    
            const scanResultsDiv = this.infoBox.querySelector("#advancedScanResults");
    
            document.getElementById("bannerGrabButton").addEventListener("click", async () => {
                const response = await fetch(`http://localhost:5000/banner_grab?ip=${data.parentId}&port=${data.port}`);
                const result = await response.json();
                const bannerText = `<br><strong>Banner:</strong> ${result.banner}`;
                data.advancedScanResults = (data.advancedScanResults || "") + bannerText;
                scanResultsDiv.innerHTML += bannerText;
            });
    
            document.getElementById("cveLookupButton").addEventListener("click", async () => {
                const response = await fetch(`http://localhost:5000/cve_lookup?service=${data.service}&version=${data.version}`);
                const result = await response.json();
                const cveText = `<br><strong>CVE Info:</strong> ${JSON.stringify(result.cve_data)}`;
                data.advancedScanResults = (data.advancedScanResults || "") + cveText;
                scanResultsDiv.innerHTML += cveText;
            });
    
            document.getElementById("reverseDNSButton").addEventListener("click", async () => {
                const response = await fetch(`http://localhost:5000/reverse_dns?ip=${data.parentId}`);
                const result = await response.json();
                const dnsText = `<br><strong>Hostname:</strong> ${result.hostname}`;
                data.advancedScanResults = (data.advancedScanResults || "") + dnsText;
                scanResultsDiv.innerHTML += dnsText;
            });
    
            document.getElementById("sslInfoButton").addEventListener("click", async () => {
                const response = await fetch(`http://localhost:5000/ssl_info?ip=${data.parentId}&port=${data.port}`);
                const result = await response.json();
                const sslText = `<br><strong>SSL Certificate:</strong> ${JSON.stringify(result.ssl_data)}`;
                data.advancedScanResults = (data.advancedScanResults || "") + sslText;
                scanResultsDiv.innerHTML += sslText;
            });
        }     
    
        if (!window.cameraController || !window.cameraController.camera) {
            console.error("Error: CameraController is missing or uninitialized.");
            return;
        }
        
        const camera = window.cameraController.camera; // ✅ Correctly reference the camera
        
    
        // ✅ SAFETY CHECK: Ensure node.position exists
        if (!node.position || !(node.position instanceof THREE.Vector3)) {
            console.error("Error: Node position is invalid or missing:", node);
            return;
        }
    
        // Convert 3D world position to 2D screen coordinates
        const nodePosition = new THREE.Vector3();
        node.getWorldPosition(nodePosition);  // Convert relative position to absolute
        nodePosition.project(camera);  // Project into normalized device coordinates
        
        // Convert normalized device coordinates (-1 to +1) to screen pixels
        const screenX = (nodePosition.x + 1) / 2 * window.innerWidth;
        const screenY = (-nodePosition.y + 1) / 2 * window.innerHeight;
        
        // Position the info box above the selected target (not the origin)
        this.infoBox.style.left = `${screenX + 20}px`;
        this.infoBox.style.top = `${screenY - 20}px`;
    
        this.infoBox.style.display = "block";
    
        if (scanButtonHtml) {
            const portScanButton = this.infoBox.querySelector("#portScanButton");
            portScanButton.addEventListener("click", async () => {
                try {
                    portScanButton.disabled = true;
                    portScanButton.innerText = "Scanning...";
    
                    if (window.eventsManager) {
                        window.eventsManager.resetSelection(true);
                    }
    
                    const response = await fetch(`http://localhost:5000/scan_ports?ip=${data.id}`);
                    const result = await response.json();
    
                    const scanResultsDiv = this.infoBox.querySelector("#scanResults");
                    scanResultsDiv.innerHTML = `<br><strong>Open Ports:</strong> ${result.ports.length > 0 ? result.ports.join(", ") : "None found"}`;
    
                    // ** Store scan results in userData for persistence **
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
            }, { once: true });
        }
    
    
        if (travelButtonHtml) {
            const travelButton = this.infoBox.querySelector("#travelButton");
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
        }
        // Inside ui.js in the showInfo() method, after setting up the basic info content
if (node.userData.type === "router" && node.userData.open_external_port) {
    // Append the change external network UI elements
    this.infoBox.innerHTML += `
      <br>
      <button id="changeExternalNetwork">Change External Network</button>
      <div id="externalNetworkSelector" style="display:none; margin-top:10px;">
        <select id="externalNetworkDropdown">
          <option value="8.8.8.8">Google DNS (8.8.8.8)</option>
          <option value="1.1.1.1">Cloudflare (1.1.1.1)</option>
          <option value="208.67.222.222">OpenDNS (208.67.222.222)</option>
          <option value="custom">Custom...</option>
        </select>
        <input id="customExternalNetwork" type="text" placeholder="Enter custom IP" style="display:none; margin-left:5px;" />
        <button id="submitExternalNetwork" style="margin-left:5px;">Submit</button>
      </div>
    `;
  
    // Set up the event listener for showing/hiding the selector
    const changeBtn = this.infoBox.querySelector("#changeExternalNetwork");
    const selectorDiv = this.infoBox.querySelector("#externalNetworkSelector");
    changeBtn.addEventListener("click", () => {
      selectorDiv.style.display = selectorDiv.style.display === "none" ? "block" : "none";
    });
  
    // Listen for dropdown changes to reveal the custom input when needed
    const dropdown = this.infoBox.querySelector("#externalNetworkDropdown");
    const customInput = this.infoBox.querySelector("#customExternalNetwork");
    dropdown.addEventListener("change", () => {
      if (dropdown.value === "custom") {
        customInput.style.display = "inline-block";
      } else {
        customInput.style.display = "none";
      }
    });
  
    // Set up the submit button to send the new external target to the backend
    const submitBtn = this.infoBox.querySelector("#submitExternalNetwork");
    submitBtn.addEventListener("click", async () => {
      let selectedTarget = dropdown.value;
      if (selectedTarget === "custom") {
        selectedTarget = customInput.value;
      }
      
      // Validate the input (basic validation)
      if (!selectedTarget.match(/^(?:\d{1,3}\.){3}\d{1,3}$/)) {
        alert("Please enter a valid IPv4 address.");
        return;
      }
      
      try {
        const response = await fetch("http://localhost:5000/set_external_target", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ target: selectedTarget })
        });
        const result = await response.json();
        if (result.status === "success") {
          alert(`External network target updated to ${result.target}. Changes will be visible after the next update.`);
        } else {
          alert(`Error: ${result.message}`);
        }
      } catch (err) {
        console.error("Error updating external target:", err);
        alert("Error updating external target.");
      }
    });
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
  