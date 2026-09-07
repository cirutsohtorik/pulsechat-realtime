/**
 * Resilient WebSocket Client for PulseChat
 * Handles reconnection, event routing, keepalives, and queuing.
 */
class PulseSocket {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 15;
    this.reconnectInterval = 1000;
    this.sendQueue = [];
    this.isConnected = false;
    this.pingTimer = null;
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}`;

    this.emit('status', 'connecting');

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      console.error('WebSocket instantiation error', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.reconnectInterval = 1000;
      this.emit('status', 'connected');
      this.emit('open');

      // Flush queue
      while (this.sendQueue.length > 0) {
        const item = this.sendQueue.shift();
        this.send(item);
      }

      this.startKeepAlive();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.emit('message', msg);
        if (msg.type) {
          this.emit(msg.type, msg);
        }
      } catch (err) {
        console.error('Failed to parse incoming socket message', err);
      }
    };

    this.ws.onclose = (event) => {
      this.isConnected = false;
      this.stopKeepAlive();
      this.emit('status', 'disconnected');
      this.emit('close', event);
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error('Socket encountered error', err);
      this.emit('error', err);
    };
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('status', 'failed');
      return;
    }

    const backoff = Math.min(this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts), 15000);
    this.reconnectAttempts++;

    setTimeout(() => {
      console.log(`Reconnecting attempt ${this.reconnectAttempts}...`);
      this.connect();
    }, backoff);
  }

  send(data) {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      this.sendQueue.push(data);
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, payload) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach((fn) => {
        try {
          fn(payload);
        } catch (err) {
          console.error(`Error in socket listener for ${event}:`, err);
        }
      });
    }
  }

  startKeepAlive() {
    this.stopKeepAlive();
    this.pingTimer = setInterval(() => {
      this.send({ type: 'PING' });
    }, 25000);
  }

  stopKeepAlive() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}

window.pulseSocket = new PulseSocket();
