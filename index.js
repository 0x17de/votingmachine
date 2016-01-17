sq3 = require('sqlite3');
express = require('express');
fs = require('fs');


bodyParser = require('body-parser');
app = express()
app.use(bodyParser.urlencoded({extended:true}));



var remote = true;
var port = 12364;



function getIp(req) {
	return remote?req.headers['x-forwarded-for']:req.ip;
}



//template = fs.readFileSync('template.html');
db = new sq3.Database('votes.db');

db.serialize(function() {
	db.run('CREATE TABLE IF NOT EXISTS ideas (id integer primary key, time time, upvotes integer DEFAULT 0, downvotes integer DEFAULT 0, message text, ip text)');
	db.run('CREATE TABLE IF NOT EXISTS votes (id integer primary key, time time, idea integer, ip text)');
	db.run('SELECT count(*) FROM ideas');

	function addIdea(message, ip, cb) {
		message = String(message).replace(/^[ \t]*(.*)[ \t]*$/, "$1");
		if (message.length > 140) return void cb(-1);

		db.get("SELECT COUNT(*) as count FROM ideas WHERE ip = ? AND time > datetime('now','-20 second') ORDER BY time DESC LIMIT 1", ip, function(err, row) {
			if (err || row && row.count >= 1)
				return void cb(-2);
			db.get("SELECT COUNT(*) as count FROM ideas WHERE ip = ? AND time > datetime('now','-20 hour') ORDER BY time DESC LIMIT 11", ip, function(err, row) {
				if (err || row && row.count >= 10)
					return void cb(-3);
				db.get("SELECT COUNT(*) as count FROM ideas WHERE message = ? LIMIT 1", message, function(err, row) {
					if (err || row && row.count >= 1)
						return void cb(-4);
					db.run("INSERT INTO ideas (time, message, ip) VALUES (datetime('now'), ?, ?)", message, ip, function() {
						return void cb(this.lastID);
					});
				});
			});
	  });
	}
	function vote(id, bUp, ip, cb) {
		db.get("SELECT COUNT(*) as count FROM votes WHERE idea = ? AND ip = ? AND time > datetime('now', '-1 day') ORDER BY time DESC LIMIT 1", id, ip, function(err, row) {
			if (err || row && row.count >= 1) return void cb(0); // we want NO votes for the day

			if (bUp)
				db.run('UPDATE ideas SET upvotes = upvotes + 1 WHERE id = ?', id);
			else
				db.run('UPDATE ideas SET upvotes = upvotes - 1 WHERE id = ?', id);
			db.run("INSERT INTO votes (time, idea, ip) VALUES (datetime('now'), ?, ?)", id, ip);

			return void cb(1);
		});
	}


	app.get('/', function(req, res) {
	  res.sendFile('./template.html', {root:'.'});
	});
	app.get('/ideas/', function(req, res) {
		var result = [];
		db.each('SELECT id,upvotes,downvotes,message FROM ideas ORDER BY time ASC', function(err, row) {
			result.push([row.id, row.upvotes - row.downvotes, row.message]);
		}, function() {
		res.send(JSON.stringify(result));
	  });
	});
	app.post('/upvote/:id/', function(req, res) {
		vote(req.params.id, true, getIp(req), function(id) {
		  res.send(String(id));
		});
	});
	app.post('/downvote/:id/', function(req, res) {
		vote(req.params.id, false, getIp(req), function(id) {
		  res.send(String(id));
		});
	});
	app.post('/ideas/', function(req, res) {
	  addIdea(req.body.text, getIp(req), function(id) {
		  res.send(String(id));
	  });
	});

	app.listen(port);
});
