echo "this is not an automated install script !!!"
echo "open the file and manually run the commands"
read
sudo apt update && sudo apt -y upgrade
sudo reboot
sudo apt update

## Dependencies
sudo apt install libmicrohttpd-dev libjansson-dev \
	libssl-dev libsrtp-dev libsofia-sip-ua-dev libglib2.0-dev \
	libopus-dev libogg-dev libcurl4-openssl-dev liblua5.3-dev \
	libconfig-dev pkg-config gengetopt libtool automake

## Libnice
sudo apt remove libnice-dev
git clone https://gitlab.freedesktop.org/libnice/libnice
cd libnice
sudo ./autogen.sh
sudo ./configure --prefix=/usr
make && sudo make install
	
## libsrtp
sudo apt remove libsrtp
wget https://github.com/cisco/libsrtp/archive/v2.2.0.tar.gz
tar xfv v2.2.0.tar.gz
cd libsrtp-2.2.0
sudo ./configure --prefix=/usr --enable-openssl
sudo make shared_library && sudo make install
	
## datachannels
git clone https://github.com/sctplab/usrsctp
cd usrsctp
./bootstrap
./configure --prefix=/usr && make && sudo make install

## Compile
git clone https://github.com/meetecho/janus-gateway.git
cd janus-gateway
sudo make clean
sudo sh autogen.sh

## Generate the configure file
sudo ./configure --prefix=/opt/janus --enable-libsrtp2 --disable-websockets --disable-rabbitmq --disable-mqtt --disable-nanomsg --disable-turn-rest-api --disable-plugin-audiobridge --disable-plugin-echotest --disable-plugin-recordplay --disable-plugin-sip --disable-plugin-sipre --disable-plugin-nosip --disable-plugin-streaming --disable-plugin-textroom --disable-plugin-videocall --disable-plugin-voicemail
sudo make
make install

## Make config files
sudo make configs
cd ..

## for https, use certbot on your nginx and
# copy certificates url's in transport.jcfg and edit the file, also edit janus.cfg
# for renewal use: certbot renew
## At the bottom of janus.transport.http.jcfg.
certificates: {
cert_pem = "/etc/letsencrypt/live/www.jasconcept.com/fullchain.pem"
cert_key = "/etc/letsencrypt/live/www.jasconcept.com/privkey.pem"
#cert_pwd = "secretpassphrase"
#ciphers = "PFS:-VERS-TLS1.0:-VERS-TLS1.1:-3DES-CBC:-ARCFOUR-128"
}

##INSTALL MARIADB
# MariaDB repository list - check your repo here:
# http://downloads.mariadb.org/mariadb/repositories/
sudo apt-get install software-properties-common
sudo apt-key adv --recv-keys --keyserver hkp://keyserver.ubuntu.com:80 0xF1656F24C74CD1D8
sudo add-apt-repository 'deb [arch=amd64,arm64,ppc64el] http://mariadb.mirror.nucleus.be/repo/10.4/ubuntu bionic main'sudo apt update
sudo apt install mariadb-server
sudo systemctl status mariadb
mysql -V
# sudo mysql_secure_installation (set password and reply all with YES)
sudo mysql_secure_installation

##INSERT INTO DB
mysql -h 127.0.0.1 -P 3306 -u root -p << EOF
DROP DATABASE IF EXISTS janusevents;
CREATE DATABASE janusevents;
USE janusevents;
CREATE TABLE sessions (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, session BIGINT(30) NOT NULL, event VARCHAR(30) NOT NULL, transportId VARCHAR(100), timestamp datetime NOT NULL);
CREATE TABLE handles (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, session BIGINT(30) NOT NULL, handle BIGINT(30) NOT NULL, event VARCHAR(30) NOT NULL, plugin VARCHAR(100) NOT NULL, opaque VARCHAR(100), timestamp datetime NOT NULL);
CREATE TABLE core (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(30) NOT NULL, value VARCHAR(30) NOT NULL, timestamp datetime NOT NULL);
CREATE TABLE sdps (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, session BIGINT(30) NOT NULL, handle BIGINT(30) NOT NULL, remote BOOLEAN NOT NULL, offer BOOLEAN NOT NULL, sdp VARCHAR(3000) NOT NULL, timestamp datetime NOT NULL);
CREATE TABLE ice (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, session BIGINT(30) NOT NULL, handle BIGINT(30) NOT NULL, stream INT NOT NULL, component INT NOT NULL, state VARCHAR(30) NOT NULL, timestamp datetime NOT NULL);
CREATE TABLE selectedpairs (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, session BIGINT(30) NOT NULL, handle BIGINT(30) NOT NULL, stream INT NOT NULL, component INT NOT NULL, selected VARCHAR(200) NOT NULL, timestamp datetime NOT NULL);
CREATE TABLE dtls (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, session BIGINT(30) NOT NULL, handle BIGINT(30) NOT NULL, stream INT NOT NULL, component INT NOT NULL, state VARCHAR(30) NOT NULL, timestamp datetime NOT NULL);
CREATE TABLE connections (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, session BIGINT(30) NOT NULL, handle BIGINT(30) NOT NULL, state VARCHAR(30) NOT NULL, timestamp datetime NOT NULL);
CREATE TABLE media (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, session BIGINT(30) NOT NULL, handle BIGINT(30) NOT NULL, medium VARCHAR(30) NOT NULL, receiving BOOLEAN NOT NULL, timestamp datetime NOT NULL);
CREATE TABLE stats (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, session BIGINT(30) NOT NULL, handle BIGINT(30) NOT NULL, medium VARCHAR(30) NOT NULL, base INT, lsr INT, lostlocal INT, lostremote INT, jitterlocal INT, jitterremote INT, packetssent INT, packetsrecv INT, bytessent BIGINT, bytesrecv BIGINT, nackssent INT, nacksrecv INT, timestamp datetime NOT NULL);
CREATE TABLE plugins (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, session BIGINT(30), handle BIGINT(30), plugin VARCHAR(100) NOT NULL, event VARCHAR(3000) NOT NULL, timestamp datetime NOT NULL);
CREATE TABLE transports (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, transport VARCHAR(100) NOT NULL, transportId VARCHAR(100) NOT NULL, event VARCHAR(300) NOT NULL, timestamp datetime NOT NULL);
CREATE TABLE participants (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, session BIGINT(30) NOT NULL, handle BIGINT(30) NOT NULL, roomid BIGINT(30) NOT NULL, userid BIGINT(30) NOT NULL, displayname VARCHAR(100), timestamp datetime NOT NULL);
CREATE TABLE publishers (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, session BIGINT(30) NOT NULL, handle BIGINT(30) NOT NULL, roomid BIGINT(30) NOT NULL, userid BIGINT(30) NOT NULL, timestamp datetime NOT NULL);
CREATE TABLE subscriptions (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, session BIGINT(30) NOT NULL, handle BIGINT(30) NOT NULL, roomid BIGINT(30) NOT NULL, feed BIGINT(30) NOT NULL, timestamp datetime NOT NULL);
CREATE TABLE registr_users (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, chattypeid VARCHAR(100), chatid VARCHAR(100), username VARCHAR(100), registrationsid INT NOT NULL, timestamp datetime NOT NULL);
CREATE TABLE registrations (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, serial VARCHAR(100), token VARCHAR(100), room INT NOT NULL, pin VARCHAR(100), authstring VARCHAR(100), active INT NOT NULL, timestamp datetime NOT NULL);
GRANT ALL PRIVILEGES ON janusevents.* TO 'janusadmin'@'localhost' IDENTIFIED BY 'overlord';
EOF

##INSTALL NODEJS
curl -sL https://deb.nodesource.com/setup_13.x | sudo -E bash -
sudo apt-get install -y nodejs
#Install the dependencies for the node.js backend:
npm install
#============================================================
# add janus.service
# Create and populate `/lib/systemd/system/janus.service`
#============================================================
sudo bash -c 'cat > /lib/systemd/system/janus.service' << EOF
[Unit]
Description=Janus WebRTC gateway
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/bin/node -e 'require("/root/janus-service/janus-service.js").execJanus(1)'
ExecStartPost=/usr/bin/node -e 'require("/root/janus-service/janus-service.js").activateregistrations()'
ExecStop=/usr/bin/node -e 'require("/root/janus-service/janus-service.js").execJanus(0)'
RemainAfterExit=true
IgnoreSIGPIPE=false

[Install]
WantedBy=multi-user.target
EOF
sudo chmod 644 /lib/systemd/system/janus.service
sudo systemctl enable janus.service
#============================================================
# add service script janus-service.sh
# Create and populate `/root/janus-service/janus-service.sh`
#============================================================
sudo bash -c 'cat > /root/janus-service.sh' << EOF
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
EOF
#============================================================
# add janus-events.service
# Create and populate `/lib/systemd/system/janus-events.service`
#============================================================
sudo bash -c 'cat > /lib/systemd/system/janus-events.service' << EOF
[Unit]
Description=Janus EVENTS gateway
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node /root/janus-events/janus-events.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
sudo chmod 644 /lib/systemd/system/janus-events.service
sudo systemctl enable janus-events.service
#============================================================
# add janus-https.service
# Create and populate `/lib/systemd/system/janus-https.service`
#============================================================
sudo bash -c 'cat > /lib/systemd/system/janus-https.service' << EOF
[Unit]
Description=Janus HTTPS server
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node /root/janus-https/janus-https.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
sudo chmod 644 /lib/systemd/system/janus-https.service
sudo systemctl enable janus-https.service
#============================================================
# add janus-chat.service
# Create and populate `/lib/systemd/system/janus-chat.service`
#============================================================
sudo bash -c 'cat > /lib/systemd/system/janus-chat.service' << EOF
[Unit]
Description=Janus CHAT server
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node /root/janus-chat/janus-chat.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
sudo chmod 644 /lib/systemd/system/janus-chat.service
sudo systemctl enable janus-chat.service
sudo systemctl daemon-reload

## Optionally run Janus on Verbose level 7
#/opt/janus/bin/janus -d 7
## Or run Janus with event handlers enabled
#/opt/janus/bin/janus -e
