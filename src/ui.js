// src/ui.js
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
        let scanButtonHtml = "";
        if (ipRegex.test(data.id) && data.type !== "ship") {
            scanButtonHtml = `<button id="portScanButton">Scan Ports</button>`;
        }
        let travelButtonHtml = "";
        if (data.type !== "ship") {
            travelButtonHtml = `<button id="travelButton">Travel</button>`;
        }
    
        this.infoBox.innerHTML = `
            <strong>${data.label || "Unknown"}</strong><br>
            MAC: ${data.mac || "N/A"}<br>
            Role: ${data.role || "N/A"}<br>
            ${scanButtonHtml}
            ${travelButtonHtml}
            <div id="scanResults"></div>
        `;
    
        // Convert 3D world position to 2D screen coordinates
        const nodePosition = node.position.clone();
        nodePosition.project(window.camera); // Project into normalized device coordinates
    
        // Convert normalized device coordinates (-1 to +1) to screen pixels
        const screenX = (nodePosition.x + 1) / 2 * window.innerWidth;
        const screenY = (-nodePosition.y + 1) / 2 * window.innerHeight;
    
        // Position the info box slightly above the node to avoid overlap
        const offset = 20;  // Adjust to fine-tune positioning
        this.infoBox.style.left = `${screenX + offset}px`;
        this.infoBox.style.top = `${screenY - offset}px`;
    
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
    
                    node.userData.open_ports = result.ports;
    
                    if (result.ports.length > 0) {
                        node.material.color.set(0xffff00);
                    }
    
                    if (typeof window.nodesManager !== 'undefined') {
                        window.nodesManager.spawnChildNodes(node, result.ports);
                    }
                    
                } catch (err) {
                    const scanResultsDiv = this.infoBox.querySelector("#scanResults");
                    scanResultsDiv.innerHTML = `<br><strong>Error scanning ports:</strong> ${err}`;
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
  