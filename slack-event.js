module.exports = function(RED) {
    function SlackEventNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        if (RED.settings.httpNodeRoot === false) {
          this.warn("slack-event not created");
          return;
        }
        if (!config.url) {
          this.warn("slack-event missing path");
          return;
        }
        node.url = config.url;
        if (this.url[0] !== '/') {
          this.url = "/" + this.url;
        }
        node.on('input', function(msg) {
            msg.payload = msg.payload.toLowerCase();
            node.send(msg);
        });
    }
    RED.nodes.registerType("slack-event", SlackEventNode);
}
