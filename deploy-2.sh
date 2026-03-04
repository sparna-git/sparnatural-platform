ssh -i /home/thomas/.ssh/sparna-keypair-francfort.pem ubuntu@92.243.27.145 'sudo su -c "\
service sparnatural-services stop
cd /var/lib/sparnatural-services
git pull
npm install
service sparnatural-services start"'