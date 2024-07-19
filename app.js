require('dotenv').config();


import express from 'express';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { exec } from 'child_process';


const app = express();

const port = 8000;

app.listen(port, () => {
    console.log(`listening on port ${port}`)
});

app.use(express.json());
app.use(express.json({ verify: verifySignature }));


const GITHUB_SECRET = process.env.GITHUB_SECRET;;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const APP_URL = process.env.APP_URL;


function verifySignature(req, res, buf, encoding) {
  const signature = req.get('X-Hub-Signature') || '';
  const hmac = crypto.createHmac('sha1', GITHUB_SECRET);
  const digest = Buffer.from('sha1=' + hmac.update(buf).digest('hex'), 'utf8');
  const checksum = Buffer.from(signature, 'utf8');
  if (checksum.length !== digest.length || !crypto.timingSafeEqual(digest, checksum)) {
    res.status(403).send('Request body digest did not match X-Hub-Signature');
  }
}

app.get("/" , (req, res)=>{
    res.send("First test")
})

app.post('/webhook', (req, res) => {
  const event = req.headers['x-github-event'];
  const payload = req.body;

  if (event === 'pull_request') {
    const action = payload.action;
    const prNumber = payload.number;
    const repoName = payload.repository.full_name;
    const branchName = payload.pull_request.head.ref;

    if (action === 'opened' || action === 'synchronize') {
      deployPR(repoName, branchName, prNumber);
    } else if (action === 'closed') {
      cleanupPR(repoName, prNumber);
    }
  }

  res.status(200).send('Success');
});

function deployPR(repoName, branchName, prNumber) {
  exec('docker-compose up -d --build', (err, stdout, stderr) => {
    if (err) {
      console.error(`Error deploying PR: ${err}`);
      return;
    }
    console.log(`Deployed PR: ${stdout}`);
    commentOnPR(repoName, prNumber, `PR deployed: ${APP_URL}/${prNumber}`);
  });
}

function cleanupPR(repoName, prNumber) {
  exec('docker-compose down', (err, stdout, stderr) => {
    if (err) {
      console.error(`Error cleaning up PR: ${err}`);
      return;
    }
    console.log(`Cleaned up PR: ${stdout}`);
    commentOnPR(repoName, prNumber, 'PR closed and environment cleaned up.');
  });
}

function commentOnPR(repoName, prNumber, message) {
  const url = `https://api.github.com/repos/${repoName}/issues/${prNumber}/comments`;
  const headers = {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json'
  };
  const body = JSON.stringify({ body: message });

  fetch(url, { method: 'POST', headers, body })
    .then(res => res.json())
    .then(json => console.log(json))
    .catch(err => console.error(`Error commenting on PR: ${err}`));
}

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
