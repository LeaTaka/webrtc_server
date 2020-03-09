#!/usr/bin/env node

/*
This is just a basic login form design we'll use for our login system, the 
method for the form is set to POST and the action is set to auth, the form 
data will be sent to our node server using this method.
Now we can go ahead and create our Node.js application, create a new file 
called: login.js, open the file with your favorite code editor.
We need to include the packages in our Node.js application, create the 
following variables and require the modules:
*/
var mysql = require('mysql');
var fs = require('fs');
var http = require('http');
var https = require('https');
var privateKey  = fs.readFileSync('/etc/letsencrypt/live/www.jasconcept.com/privkey.pem', 'utf8');
var certificate = fs.readFileSync('/etc/letsencrypt/live/www.jasconcept.com/fullchain.pem', 'utf8');
var credentials = {key: privateKey, cert: certificate};
var express = require('express');
var session = require('express-session');
var bodyParser = require('body-parser');
var path = require('path');
var multer  = require('multer')
var upload = multer()

const cfg = JSON.parse(fs.readFileSync('/root/db-settings/cfg.json', 'utf8'))

/*
We can now connect to our database with the following code:
Remember to change the connection details to your own.
*/
var connection = mysql.createConnection(cfg.db);
/*
Express is what we'll use for our web applications, this includes packages 
useful in web development, such as sessions and handling HTTP requests, to 
initialize it we can do:
*/
var app = express();
/*
We now need to let Express know we'll be using some of its packages:
Make sure to change the secret code for the sessions, the sessions package 
is what we'll use to determine if the user is logged-in, the bodyParser 
package will extract the form data from our login.html file.
*/
app.use(session({
	secret: 'secret',
	resave: true,
	saveUninitialized: true
}));
app.use(bodyParser.urlencoded({extended : true}));
app.use(bodyParser.json());
app.use(express.static(__dirname));
//app.use(express.static(path.join(__dirname, '/public')));
/*
We now need to display our login.html file to the client:
When the client connects to the server the login  page will be displayed, 
the server will send the login.html file.
*/
app.get('/view', function(request, response) {
	response.sendFile('/root/nodelogin/public/index.html');
});
/*
We need to now handle the POST request, basically what happens here is 
when the client enters their details in the login form and clicks the 
submit button, the form data will be sent to the server, and with that 
data our login script will check in our MySQL accounts table to see if 
the details are correct.
What happens here is we first create the POST request in our script, 
our login form action is to: auth so we need to use that here, after, 
we create two variables, one for the authstring and one for the password, 
we then check to see if the authstring and password exist, if they are we 
query our MySQL table: accounts and check to see if the details exist in 
the table.
If the result returned from the table exists we create two session 
variables, one to determine if the client is logged in and the other will 
be their authstring.
If no result are returned we send to the client an error message, this 
message will let the client know they've entered the wrong details.
If everything went as expected and the client logs in they will be  
redirected to the home page.
*/
app.post('/auth', upload.array(), function(request, response) {
	//console.log(request.body);
	var authstring = request.body.authstring;
	var value = (request.body.value);
	if (authstring) {
		connection.query('SELECT r.serial, r.token, r.room, r.pin, u.username, u.id FROM registrations r INNER JOIN registr_users u ON r.id = u.registrationsid WHERE r.authstring = ? AND u.id = ?;', [authstring, value], function(error, result, fields) {
			if (result.length > 0) {
				request.session.loggedin = true;
				request.session.authstring = authstring;
				token = result[0].token;
				serial = result[0].serial;
				room = result[0].room;
				pin = result[0].pin;
				username = result[0].username;
				response.send('{"auth":"True", "token":"'+token+'", "room":"'+room+'", "pin":"'+pin+'", "username":"'+username+'"}');
				console.log("Positive response sent back to client: "+serial)
			}			
			response.end();
		});
	} 
});
/*
And to run our new web application we can run the following command: 
node login.js in command prompt/console, this will start the server, if 
we enter the address: http://localhost:3000/ it should display our 
login form.
*/
var httpServer = http.createServer(app);
var httpsServer = https.createServer(credentials, app);
//httpServer.listen(cfg.jnswebsrv.http);
httpsServer.listen(cfg.jnswebsrv.https);
console.log("Janus authorization backend started");
console.log("Public HTTPS server successfully started");