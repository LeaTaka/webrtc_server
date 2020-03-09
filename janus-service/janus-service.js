#!/usr/bin/env node
//SEE BOTTOM FOR COMMANDS
var mysql = require('mysql');
var fs = require('fs');
const util = require('util');
const axios = require('axios');
const cfg = JSON.parse(fs.readFileSync('/root/db-settings/cfg.json', 'utf8'))

const exec = util.promisify(require('child_process').exec);
const connection = mysql.createConnection(cfg.db);

module.exports.execJanus = async function execJanus(cmd) {
	if (cmd === 1) {cmd = '/opt/janus/bin/janus -e -b -d 7 -L /root/janus.log'}
	if (cmd === 0) {cmd = 'sudo pkill -x janus'}
	try {
		const { stdout, stderr } = await exec(cmd);
		//console.log('stdout:', stdout);
		//console.log('stderr:', stderr);
		}catch (err) {
		console.error(err);
	};
};

module.exports.activateregistrations = function (){
	var query = connection.query('SELECT token FROM registrations WHERE active = 1;', function(error, result, fields) {
		if (result.length > 0) {
			//console.log(result);
			var list = result;
			for(var f in list) {
				var token = list[f]['token'];
				console.log(list[f]['token']);
				janustokens(token, 'add');
			}
		}
	});
	connection.end();
}

//REMOVE / ADD / LIST  -  TOKEN
function janustokens(token, action) {
	adminurl = cfg.jns.host+":"+cfg.jns.port+cfg.jns.path
	adminsecret = cfg.jns.adminsecret
	transaction = 'RUlslJnHGFeoto00u9oM5J2CzOc5gYRUlslJnHGFeoto00u9oM5J2CzOc5gY'
	if (action === "list") {action = "list_tokens"}
	if (action === "add") {action = "add_token"}
	if (action === "remove") {action = "remove_token"}
	axios({
		method: 'post',
		url: adminurl,
		data: {"janus" : ""+action+"", "token" : ""+token+"", "plugins": [ "janus.plugin.videoroom" ], "transaction" : ""+transaction+"", "admin_secret" : ""+adminsecret+""},
		headers: {'Content-Type': 'application/json'}
	})
	.then(function (response) {
	//console.log(response.data);
	if (response.data.janus === 'success') {
		//console.log(response.data.janus);
			if ("data" in response.data) {
				if ("tokens" in response.data.data) {
					console.log("List tokens ",response.data.data.tokens);
				}
				if ("plugins" in response.data.data) {
					console.log("Successfull token addition for ",response.data.data.plugins);
				}
			}
		} else {
		console.log(response.data.error);
		}
	})
	.catch(function (error) {
	console.log(error);
	});
}

//activateregistrations();
//execJanus(1);
//execJanus(0);