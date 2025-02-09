// src/ui.js
export class UIManager {
    constructor() {
      // Create the info box element
      this.infoBox = document.createElement("div");
      this.infoBox.style.position = "absolute";
      this.infoBox.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
      this.infoBox.style.color = "white";
      this.infoBox.style.padding = "10px";
      this.infoBox.style.borderRadius = "5px";
      this.infoBox.style.display = "none";
      // Prevent pointer events on the infoBox from propagating
      this.infoBox.addEventListener("mouseenter", (e) => e.stopPropagation());
      document.body.appendChild(this.infoBox);
    }
    
    showInfo(node, event) {
      const data = node.userData;
      // Check if the node's id looks like an IP address (and isn’t the ship)
      const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
      let scanButtonHtml = "";
      if (ipRegex.test(data.id) && data.type !== "ship") {
        scanButtonHtml = `<button id="portScanButton">Scan Ports</button>`;
      }
      // Build the info box content with a container for scan results
      this.infoBox.innerHTML = `
        <strong>${data.label || "Unknown"}</strong><br>
        MAC: ${data.mac || "N/A"}<br>
        Role: ${data.role || "N/A"}<br>
        ${scanButtonHtml}
        <div id="scanResults"></div>
      `;
      this.infoBox.style.left = `${event.clientX + 10}px`;
      this.infoBox.style.top = `${event.clientY + 10}px`;
      this.infoBox.style.display = "block";
      
      // If the Scan Ports button is present, attach its click listener
      if (scanButtonHtml) {
        const portScanButton = this.infoBox.querySelector("#portScanButton");
        portScanButton.addEventListener("click", async () => {
          try {
            portScanButton.disabled = true;
            portScanButton.innerText = "Scanning...";
            // Trigger the backend call to scan ports (adjust the URL as needed)
            const response = await fetch(`http://localhost:5000/scan_ports?ip=${data.id}`);
            const result = await response.json();
            // Update the node's userData with the scan results
            node.userData.open_ports = result.ports;
            const scanResultsDiv = this.infoBox.querySelector("#scanResults");
            scanResultsDiv.innerHTML = `<br><strong>Open Ports:</strong> ${result.ports.length > 0 ? result.ports.join(", ") : "None found"}`;
            // Optionally update node appearance (e.g., change color to yellow if ports are found)
            if (result.ports.length > 0) {
              node.material.color.set(0xffff00);
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
    }
    
    hideInfo() {
      this.infoBox.style.display = "none";
    }
  }
  