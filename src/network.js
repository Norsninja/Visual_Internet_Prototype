// src/network.js
export class NetworkManager {
  constructor(nodesManager, edgesManager, endpoint = 'http://localhost:5000') {
    this.nodesManager = nodesManager;
    this.edgesManager = edgesManager;
    this.endpoint = endpoint;
  }
  async fetchNetworkData(attempt = 0) {
    try {
        const response = await fetch(`${this.endpoint}/network`);
        if (!response.ok) throw new Error(`Network error: ${response.status}`);

        let data = await response.json();

        if (!data.nodes || data.nodes.length === 0) {
            console.warn(`No nodes received (Attempt ${attempt}), retrying in 5s...`);
            if (attempt < 10) {  // Retry up to 10 times
                setTimeout(() => this.fetchNetworkData(attempt + 1), 5000);
            }
            return;
        }

        console.log("Fetched Network Data:", data);

        // ✅ Ensure Three.js correctly updates positions
        this.updateNodes(data.nodes);
        this.updateEdges(data.edges);
    } catch (error) {
        console.error("Error fetching network data:", error);
        setTimeout(() => this.fetchNetworkData(attempt + 1), 5000);
    }
}
 

updateNodes(nodes) {
    if (!this.nodesManager) {
        console.error("Error: nodesManager is undefined when calling updateNodes()");
        return;
    }

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
  async fetchTracerouteData(targetIP, forceNew = false) {
    let url = `${this.endpoint}/remote_traceroute?target=${targetIP}`;
    if (forceNew) url += "&nocache=true";  // Backend should respect this

    fetch(url)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            console.log("Fetched Traceroute Data:", data);
            if (!data.hops || data.hops.length === 0) {
                console.warn(`⚠️ No hops returned for ${targetIP}`);
                return;
            }
            this.updateTracerouteNodes(data.hops, targetIP);
        })
        .catch(error => {
            console.error("❌ Error fetching traceroute:", error);
            alert(`Failed to run traceroute for ${targetIP}.`);
        });
}

  updateTracerouteNodes(hops, targetIP) {
    let prevNode = this.nodesManager.getNodeById(targetIP);
    let newEdges = [];
    let newNodes = [];

    hops.forEach((hop, index) => {
        let existingNode = this.nodesManager.getNodeById(hop);

        if (!existingNode) {
            const newNode = {
                id: hop,
                label: `Hop ${index + 1}`,
                type: "external",
                color: "red"
            };
            this.nodesManager.updateNodes([newNode], { preservePositions: false });

            // Add the node to the list for backend storage
            newNodes.push(newNode);
            existingNode = this.nodesManager.getNodeById(hop);
        }

        if (prevNode) {
            const edgeKey = `${prevNode.userData.id}-${hop}`;
            if (!this.edgesManager.edgeRegistry.has(edgeKey)) {
                newEdges.push({ source: prevNode.userData.id, target: hop });
            }
        }

        prevNode = existingNode;
    });

    // ✅ Merge and preserve existing edges
    const mergedEdges = [...this.edgesManager.edgesData, ...newEdges];
    this.edgesManager.updateEdges(mergedEdges);

    // ✅ Fetch full graph after update to prevent nodes from disappearing
    fetch(`${this.endpoint}/full_graph`)
        .then(response => response.json())
        .then(data => {
            this.nodesManager.updateNodes(data.nodes, { preservePositions: true });
            this.edgesManager.updateEdges(data.edges);
        })
        .catch(error => console.error("Error fetching full graph:", error));

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

//helper function for background
// You can add this function in network.js or as a global helper in main.js.
window.getTrafficLevel = function() {
  // Suppose you maintain a global array of traffic packets (or aggregate over your deque).
  // For illustration, assume window.trafficPackets is updated from your traffic endpoint.
  if (!window.trafficPackets || window.trafficPackets.length === 0) return 0;

  // Sum packet sizes over the last N seconds
  let totalSize = 0;
  window.trafficPackets.forEach(packet => {
    totalSize += packet.size;
  });

  // Normalize the value (choose a maximum value based on expected peak traffic)
  const maxTraffic = 100000; // Adjust based on testing
  const normalizedTraffic = Math.min(totalSize / maxTraffic, 1.0);
  return normalizedTraffic;
};

// Ensure that traffic data from your /traffic endpoint is stored globally, e.g.:
window.trafficPackets = [];
// Modify your fetchTrafficData function to update window.trafficPackets as needed.

//remote tracert code
