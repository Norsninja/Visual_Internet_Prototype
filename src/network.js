// src/network.js
export class NetworkManager {
  constructor(nodesManager, edgesManager, endpoint = 'http://localhost:5000') {
    this.nodesManager = nodesManager;
    this.edgesManager = edgesManager;
    this.endpoint = endpoint;
  }

  async fetchNetworkData() {
    try {
      const response = await fetch(`${this.endpoint}/network`);
      if (!response.ok) throw new Error(`Network error: ${response.status}`);
  
      const data = await response.json();
      console.log("Fetched Network Data:", data);
  
      // ✅ Ensure data contains valid 'nodes' and 'edges'
      if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
        console.warn("Invalid network data received:", data);
        return;
      }
  
      this.updateNodes(data.nodes);
      this.updateEdges(data.edges);
  
    } catch (error) {
      console.error("Error fetching network data:", error);
    }
  }
  

  updateNodes(nodes) {
    nodes.forEach(node => {
        let existingNode = this.nodesManager.getNodeById(node.id);
        if (existingNode) {
            // ✅ Only update metadata, NOT position
            existingNode.userData = { ...existingNode.userData, ...node };
            existingNode.material.color.set(existingNode.userData.color);
        } else {
            // ✅ New nodes integrate smoothly instead of disrupting positions
            this.nodesManager.updateNodes([node], { preservePositions: true });
        }
    });
}


  updateEdges(edges) {
    this.edgesData = edges || [];
    // Directly pass all edges to the EdgesManager
    this.edgesManager.updateEdges(this.edgesData);
  }




  startPeriodicUpdates(intervalMs = 10000) {
    this.fetchNetworkData(); // Initial call
    setInterval(() => this.fetchNetworkData(), intervalMs);
  }
}

// Separate function for traffic fetching
async function fetchTrafficData(nodesManager, edgesManager) {
  try {
    const response = await fetch('http://localhost:5000/traffic');
    if (!response.ok) throw new Error(`Traffic data fetch failed: ${response.status}`);

    const trafficData = await response.json();
    
    trafficData.forEach(({ src, dst, size }) => {
      let srcNode = nodesManager.getNodeById(src);
      let dstNode = nodesManager.getNodeById(dst);

      if (srcNode && dstNode) {
        edgesManager.animateTraffic(srcNode, dstNode, size);
      }
    });

  } catch (error) {
    console.error("Error fetching traffic data:", error);
  }
}

// Poll traffic every 5 seconds
setInterval(() => fetchTrafficData(window.nodesManager, window.edgesManager), 5000);

