// src/network.js
export class NetworkManager {
    /**
     * @param {NodesManager} nodesManager - Instance of NodesManager.
     * @param {EdgesManager} edgesManager - Instance of EdgesManager.
     */
    constructor(nodesManager, edgesManager) {
      this.nodesManager = nodesManager;
      this.edgesManager = edgesManager;
      this.endpoint = 'http://localhost:5000/network';
    }
    
    async fetchNetworkData() {
        try {
            const response = await fetch(this.endpoint);
            const data = await response.json();
            
            this.nodesManager.updateNodes(data.nodes);
            this.edgesManager.updateEdges(data.edges);
    
            // Find router dynamically (assumes type="router")
            const routerNode = data.nodes.find(node => node.type === "router");
    
            if (routerNode && window.ship && !window.shipInitialized) {
                console.log("Router found at:", routerNode.id);
                window.ship.setInitialOrbit(routerNode);
                window.shipInitialized = true;  // Prevents multiple resets
            }
            
    
        } catch (error) {
            console.error('Error fetching network data:', error);
        }
    }
    
    
    startPeriodicUpdates(intervalMs = 10000) {
      this.fetchNetworkData(); // initial call
      setInterval(() => {
        this.fetchNetworkData();
      }, intervalMs);
    }
  }
  