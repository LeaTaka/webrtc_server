# stop janus webrtc server and generate a token

function getjson {
	jq -r $1 /root/db-settings/cfg.json
}

function janusStart {
	/opt/janus/bin/janus -e -b -d 7 -L /root/janus.log
}

# stop janus webrtc server
function janusStop {
	sudo pkill -x janus
}

function createToken {
	JANUSADMIN_REST_API_URL=$(getjson ".jns.host"):$(getjson ".jns.port")$(getjson ".jns.path")
	TRANSACTION=$(tr -cd '[:alnum:]' < /dev/urandom | fold -w30 | head -n1)
	ADMINSECRET=$(getjson ".jns.adminsecret")
	DATABASE=$(getjson ".db.database")
	USER=$(getjson ".db.user")
	PASSWORD=$(getjson ".db.password")

	## Get tokens from mysql table
	mysql -u${USER} -p${PASSWORD} -D ${DATABASE} -N -e "SELECT token FROM registrations WHERE active = 1" | while IFS= read -r token
	do
		JSONDATA=$(curl -s --insecure --header "Content-type: application/json" --request POST --data \
	   '{
			  "janus" : "add_token",
			  "token" : "'${token}'",
			  "plugins": [
				   "janus.plugin.videoroom"
			  ],
			  "transaction" : "'${TRANSACTION}'",
			  "admin_secret" : "'${ADMINSECRET}'"
			  
		}' \
		${JANUSADMIN_REST_API_URL})
		#echo $JSONDATA
		result=$(echo $JSONDATA | jq -r '.janus')
		if [ "$result" == "success" ]; then
			echo "Token ingested: "$token;
		else
			echo "Token ingestion: "$result;
		fi
	done
}
