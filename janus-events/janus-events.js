#!/usr/bin/env node

var async = require("async");
var fs = require('fs');
var auth = require("basic-auth");
var http = require("http");
var mysql = require("mysql");
var crypto = require('crypto');
const TeleBot = require('telebot');
const cfg = JSON.parse(fs.readFileSync('/root/db-settings/cfg.json', 'utf8'))

var connection = null;
const bot = new TeleBot(cfg.tb.token);

async.series([
	// 1. REST API server (for requests from the Frontends, typically wrapper-related)
	function(callback) {
		// Connect to the DB
		connection = mysql.createConnection(cfg.db);
		connection.connect(function(err) {
			if(err) {
				console.error("Error connecting to DB: " + err.stack);
				callback(err);
				return;
			}
			console.log("Connected to DB:", cfg.db.database);
			callback();
		});
	},
	function(callback) {
		// Create the HTTP backend
		http.createServer(function (req, res) {
			if(!cfg.jnsevents || !cfg.jnsevents.auth || !cfg.jnsevents.auth.username || !cfg.jnsevents.auth.password) {
				// No authentication required
			} else {
				// Authentication required, check the credentials
				var credentials = auth(req);
				if(!credentials || credentials.name !== cfg.jnsevents.auth.username
						|| credentials.pass !== cfg.jnsevents.auth.password) {
					res.statusCode = 401;
					res.setHeader('WWW-Authenticate', 'Basic realm="Janus events DB backend"');
					res.end();
					return;
				}
			}
			var body = "";
			req.on("data", function (chunk) {
				body += chunk;
			});
			req.on("end", function () {
				// Got an event, parse and handle it
				try {
					var json = JSON.parse(body);
					handleEvent(json);
				} catch(e) {
					console.error("Error parsing event:", e);
				}
				// Done here
				res.writeHead(200);
				res.end();
			});
		}).on('error', function(err) {
			console.error("Error starting HTTP server:", err);
			callback(err);
		}).listen(cfg.jnsevents.port, function() {
			callback();
		});
	}
],
function(err, results) {
	if(err) {
		console.log(err);
		process.exit(1);
	}
	// We're up and running
	console.log("Janus events DB backend started");
});

function handleEvent(json) {
	if(Array.isArray(json)) {
		// We got an array: it means we have multiple events, iterate on all of them
		for(var i=0; i<json.length; i++) {
			handleEvent(json[i]);
		}
		return;
	}
	// Depending on the event, save it in a different table
	//console.log(json);
	if(json.type === 1) {
		// Session event
		var sessionId = json["session_id"];
		var event = json["event"]["name"];
		var transportId = null;
		if(json["event"]["transport"])
			transportId = json["event"]["transport"]["id"];
		var when = new Date(json["timestamp"]/1000);
		// Write to DB
		var insert = { session: sessionId, event: event, transportId: transportId, timestamp: when };
		var query = connection.query('INSERT INTO sessions SET ?', insert, function(err, result) {
			if(err) {
				console.error("Error saving session event to DB...", err);
				return;
			}
		});
	} else if(json.type === 2) {
		// Handle event
		var sessionId = json["session_id"];
		var handleId = json["handle_id"];
		var event = json["event"]["name"];
		var plugin = json["event"]["plugin"];
		var opaqueId = json["event"]["opaque_id"];
		var when = new Date(json["timestamp"]/1000);
		// Write to DB
		var insert = { session: sessionId, handle: handleId, event: event, plugin: plugin, timestamp: when, opaque: opaqueId };
		var query = connection.query('INSERT INTO handles SET ?', insert, function(err, result) {
			if(err) {
				console.error("Error saving handle event to DB...", err);
				return;
			}
		});
	} else if(json.type === 8) {
		// JSEP event
		var sessionId = json["session_id"];
		var handleId = json["handle_id"];
		var remote = json["event"]["owner"] === "remote";
		var offer = json["event"]["jsep"]["type"] === "offer";
		var sdp = json["event"]["jsep"]["sdp"];
		var when = new Date(json["timestamp"]/1000);
		// Write to DB
		var insert = { session: sessionId, handle: handleId, remote: remote, offer: offer, sdp: sdp, timestamp: when };
		var query = connection.query('INSERT INTO sdps SET ?', insert, function(err, result) {
			if(err) {
				console.error("Error saving jsep event to DB...")//, err); //data is to large for sdp collumn
				return;
			}
		});
	} else if(json.type === 16) {
		// WebRTC event (can result in writes to different tables)
		var sessionId = json["session_id"];
		var handleId = json["handle_id"];
		var streamId = json["event"]["stream_id"];
		var componentId = json["event"]["component_id"];
		var when = new Date(json["timestamp"]/1000);
		if(json["event"]["ice"]) {
			// ICE state event
			var state = json["event"]["ice"];
			// Write to DB
			var insert = { session: sessionId, handle: handleId, stream: streamId, component: componentId, state: state, timestamp: when };
			var query = connection.query('INSERT INTO ice SET ?', insert, function(err, result) {
				if(err) {
					console.error("Error saving webrtc/ice event to DB...", err);
					return;
				}
			});
		} else if(json["event"]["selected-pair"]) {
			// ICE selected-pair event
			var pair = json["event"]["selected-pair"];
			// Write to DB
			var insert = { session: sessionId, handle: handleId, stream: streamId, component: componentId, selected: pair, timestamp: when };
			var query = connection.query('INSERT INTO selectedpairs SET ?', insert, function(err, result) {
				if(err) {
					console.error("Error saving webrtc/selected-pair event to DB...", err);
					return;
				}
			});
		} else if(json["event"]["dtls"]) {
			// DTLS state event
			var state = json["event"]["dtls"];
			// Write to DB
			var insert = { session: sessionId, handle: handleId, stream: streamId, component: componentId, state: state, timestamp: when };
			var query = connection.query('INSERT INTO dtls SET ?', insert, function(err, result) {
				if(err) {
					console.error("Error saving webrtc/dtls event to DB...", err);
					return;
				}
			});
		} else if(json["event"]["connection"]) {
			// Connection (up/down) event
			var state = json["event"]["connection"];
			// Write to DB
			var insert = { session: sessionId, handle: handleId, state: state, timestamp: when };
			var query = connection.query('INSERT INTO connections SET ?', insert, function(err, result) {
				if(err) {
					console.error("Error saving webrtc/connection event to DB...", err);
					return;
				}
			});
		} else {
			//console.error("Unsupported WebRTC event?");
		}
	} else if(json.type === 32) {
		// Media event (can result in writes to different tables)
		var sessionId = json["session_id"];
		var handleId = json["handle_id"];
		var medium = json["event"]["media"];
		var when = new Date(json["timestamp"]/1000);
		if(json["event"]["receiving"] !== null && json["event"]["receiving"] !== undefined) {
			// Media receiving state event
			var receiving = json["event"]["receiving"] === true;
			// Write to DB
			var insert = { session: sessionId, handle: handleId, medium: medium, receiving: receiving, timestamp: when };
			var query = connection.query('INSERT INTO media SET ?', insert, function(err, result) {
				if(err) {
					console.error("Error saving media event to DB...", err);
					return;
				}
			});
		} else if(json["event"]["base"] !== null && json["event"]["base"] !== undefined) {
			// Statistics event
			var base = json["event"]["base"];
			var lsr = json["event"]["lsr"];
			var lostlocal = json["event"]["lost"];
			var lostremote = json["event"]["lost-by-remote"];
			var jitterlocal = json["event"]["jitter-local"];
			var jitterremote = json["event"]["jitter-remote"];
			var packetssent = json["event"]["packets-sent"];
			var packetsrecv = json["event"]["packets-received"];
			var bytessent = json["event"]["bytes-sent"];
			var bytesrecv = json["event"]["bytes-received"];
			var nackssent = json["event"]["nacks-sent"];
			var nacksrecv = json["event"]["nacks-received"];
			// Write to DB
			var insert = { session: sessionId, handle: handleId, medium: medium,
				base: base, lsr: lsr, lostlocal: lostlocal, lostremote: lostremote,
				jitterlocal: jitterlocal, jitterremote: jitterremote,
				packetssent: packetssent, packetsrecv: packetsrecv,
				bytessent: bytessent, bytesrecv: bytesrecv,
				nackssent: nackssent, nacksrecv: nacksrecv,
				timestamp: when };
			var query = connection.query('INSERT INTO stats SET ?', insert, function(err, result) {
				if(err) {
					console.error("Error saving stats event to DB...", err);
					return;
				}
			});
		} else {
			console.error("Unsupported media event?");
		}
	} else if(json.type === 64) {
		// Plugin event
		var sessionId = json["session_id"];
		var handleId = json["handle_id"];
		var plugin = json["event"]["plugin"];
		var event = JSON.stringify(json["event"]["data"]);
		var when = new Date(json["timestamp"]/1000);
		// Write to DB
		var insert = { session: sessionId, handle: handleId, plugin: plugin, event: event, timestamp: when };
		var query = connection.query('INSERT INTO plugins SET ?', insert, function(err, result) {
			if(err) {
				console.error("Error saving plugin event to DB...", err);
				return;
			}
			// If this is a VideoRoom event, track participants, publishers and subscriptions
			if(plugin === "janus.plugin.videoroom") {
				var event = json["event"]["data"];
				var eventName = event["event"];
				if(eventName === "joined") {
					// Save info on new participant
					var room = event["room"];
					var userId = event["id"];
					var display = JSON.parse(event["display"]);
					var pi_serial = (display["pi_serial"]);
					var pin = (display["pin"]);
					var insert = { session: sessionId, handle: handleId, roomid: room, userid: userId, displayname: pi_serial, timestamp: when };
					var query = connection.query('INSERT INTO participants SET ?', insert, function(err, result) {
						// update indien record bestaat, zoek op serial
						var authstringraw = room+pin+pi_serial;
						var authstring = crypto.createHash('sha512').update(authstringraw).digest('base64');
						var update = [room, pin, authstring, 1, when, pi_serial];
						var query = connection.query('UPDATE registrations SET room = ?, pin = ?, authstring = ?, active = ?, timestamp = ? WHERE serial = ?', update, function(err, result) { 
							//console.log(query);
							if(err) {
								console.error("Error updating registration info in DB...", err);
								return;
							} else {
								// sending to telebot
								var query = connection.query('SELECT u.id, u.chatid, u.username FROM registrations r INNER JOIN registr_users u ON r.id = u.registrationsid WHERE r.serial = ? AND u.chatid IS NOT NULL AND u.username IS NOT NULL', [pi_serial], function(err, result) { 
									if(result.length){
											// if any error while executing above query, throw error
											if (err) throw err;
											// if there is no error, you have the result, iterate for all the rows in result
											Object.keys(result).forEach(function(key) {
												var userid = result[key].id;
												var chatid = result[key].chatid;
												console.log("Sending to telebotuser: "+chatid);
												var telegramurl = cfg.tb.host+":"+cfg.tb.port+"?"+authstring+userid;
												bot.sendMessage(chatid, "Kiss @ <a href=\""+telegramurl+"\">"+piserial+"</a>", {parseMode: 'HTML'});
											});
										}
								});
							}
						});
						if(err) {
							console.error("Error saving participant event to DB...", err);
							return;
						}
					});
				} else if(eventName === "destroyed") {
					// Save info on new publisher
					var room = event["room"];
					var update = [{ active: 0, timestamp: when }, room ];
					var query = connection.query('UPDATE registrations SET ? WHERE room = ?', update, function(err, result) {
						if(err) {
							console.error("Error saving publisher event to DB...", err);
							return;
						}
					});
				} else if(eventName === "published") {
					// Save info on new publisher
					var room = event["room"];
					var userId = event["id"];
					var insert = { session: sessionId, handle: handleId, roomid: room, userid: userId, timestamp: when };
					var query = connection.query('INSERT INTO publishers SET ?', insert, function(err, result) {
						if(err) {
							console.error("Error saving publisher event to DB...", err);
							return;
						}
					});
				} else if(eventName === "subscribing") {
					// Save info on new publisher
					var room = event["room"];
					var feed = event["feed"];
					var insert = { session: sessionId, handle: handleId, roomid: room, feed: feed, timestamp: when };
					var query = connection.query('INSERT INTO subscriptions SET ?', insert, function(err, result) {
						if(err) {
							console.error("Error saving subscription event to DB...", err);
							return;
						}
					});
				}
			}
		});
	} else if(json.type === 128) {
		// Transport event
		var transport = json["event"]["transport"];
		var transportId = json["event"]["id"];
		var event = JSON.stringify(json["event"]["data"]);
		var when = new Date(json["timestamp"]/1000);
		// Write to DB
		var insert = { transport: transport, transportId: transportId, event: event, timestamp: when };
		var query = connection.query('INSERT INTO transports SET ?', insert, function(err, result) {
			if(err) {
				console.error("Error saving transport event to DB...", err);
				return;
			}
		});
	} else if(json.type === 256) {
		// Core event
		var name = "status";
		var event = json["event"][name];
		var signum = json["event"]["signum"];
		if(signum)
			event += " (" + signum + ")";
		var when = new Date(json["timestamp"]/1000);
		// Write to DB
		var insert = { name: name, value: event, timestamp: when };
		var query = connection.query('INSERT INTO core SET ?', insert, function(err, result) {
			if(err) {
				console.error("Error saving core event to DB...", err);
				return;
			}
		});
	} else {
		console.warn("Unsupported event type " + json.type);
	}
}
