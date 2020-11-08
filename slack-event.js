const typeis = require('type-is');
const contentType = require('content-type');
const read = require('body-parser/lib/read');

module.exports = function(RED) {
    function SlackEventNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        if (RED.settings.httpNodeRoot === false) {
            node.warn("slack-event not created");
            return;
        }
        if (!config.url) {
            node.warn("slack-event missing path");
            return;
        }
        node.url = config.url;
        node.method = "post";
        if (node.url[0] !== '/') {
            node.url = "/" + node.url;
        }
        const noop = (req, res, next) => { next(); };
        const httpMiddleware = typeof RED.settings.httpNodeMiddleware === "function" && RED.settings.httpNodeMiddleware;
        let corsHandler = noop;
        if (RED.settings.httpNodeCors) {
            const cors = require('cors');
            corsHandler = cors(RED.settings.httpNodeCors);
            RED.httpNode.options("*", corsHandler);
        }
        let metricsHandler = noop;
        if (node.metric()) {
            const onHeaders = require('on-headers');
            metricsHandler = (req, res, next) => {
                const startAt = process.hrtime();
                onHeaders(res, () => {
                    if (res._msgid) {
                        const diff = process.hrtime(startAt);
                        const ms = diff[0] * 1e3 + diff[1] * 1e-6;
                        const metricResponseTime = ms.toFixed(3);
                        const metricContentLength = res.getHeader("content-length");
                        // assuming that _id has been set for res._metrics in HttpOut node!
                        node.metric("response.time.millis", {_msgid:res._msgid} , metricResponseTime);
                        node.metric("response.content-length.bytes", {_msgid:res._msgid} , metricContentLength);
                    }
                });
                next();
            };
        }
        const maxApiRequestSize = RED.settings.apiMaxLength || '5mb';
        const jsonParser = function jsonParser(req, res, next) {
            if (req._body) {
                next(); return;
            }
            req.body = req.body || {};
            if (!typeis.hasBody(req)) {
                next(); return;
            }
            if (!typeis(req, 'application/json')) {
                next(); return;
            }
            const charset = (contentType.parse(req).parameters.charset || '').toLowerCase() || 'utf-8';
            if (!charset.startsWith('utf-')) {
                const createError = require('http-errors');
                next(createError(415, `unsupported charset "${charset.toUpperCase()}"`, {type: 'charset.unsupported', charset})); return;
            }
            read(req, res, next, body => ({raw: body, json: JSON.parse(body)}), debug, {
                encoding: charset,
                inflate: true,
                limit: typeof maxApiRequestSize !== 'number' ? require('bytes').parse(maxApiRe    questSize) : maxApiRequestSize,
                verify: false
            });
        };
        RED.httpNode.post(node.url,
            httpMiddleware || noop,
            corsHandler,
            metricsHandler,
            jsonParser,
            (req, res) => {
                const _msgid = RED.util.generateId();
                res._msgid = _msgid;
                node.send({_msgid, req, res: {_res: res}, payload: req.body});
            },
            (err, req, res, next) => {
                node.warn(err);
                res.sendStatus(500);
            }
        );
        node.on('close', function() {
            const node = this;
            RED.httpNode._router.stack.forEach(function (route, i, routes) {
                if (route.route && route.route.path === node.url && route.route.methods.post) {
                    routes.splice(i,1);
                }
            });

        });
    }
    RED.nodes.registerType("slack-event", SlackEventNode);
}
