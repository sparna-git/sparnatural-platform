#!/bin/bash

USER="tarek"
SERVER="calliope.sparna.fr"
APP_DIR="/home/tarek/sparnatural-services/sparnatural-platform"
PM2_APP_NAME="sparnatural-services"

echo "Déploiement du projet sur $SERVER"

ssh "$USER@$SERVER" bash -s << ENDSSH
set -e

APP_DIR="$APP_DIR"
PM2_APP_NAME="$PM2_APP_NAME"

# Charger nvm pour avoir npm et pm2
export NVM_DIR="\$HOME/.nvm"
[ -s "\$NVM_DIR/nvm.sh" ] && \. "\$NVM_DIR/nvm.sh"
[ -s "\$NVM_DIR/bash_completion" ] && \. "\$NVM_DIR/bash_completion"

echo "-> Accès au dossier du projet : \$APP_DIR"
cd "\$APP_DIR"

echo "-> Mise à jour du code avec git pull..."
git pull origin main

echo "-> Installation des dépendances..."
npm install

echo "-> Redémarrage de l'application pm2 (\$PM2_APP_NAME)..."
if pm2 list | grep -q "\$PM2_APP_NAME"; then
  pm2 restart "\$PM2_APP_NAME" --update-env
else
  pm2 start npm --name "\$PM2_APP_NAME" -- start
fi

echo "-> Sauvegarde de la liste pm2 pour reboot"
pm2 save

echo "Déploiement terminé avec succès."
ENDSSH

if [ $? -eq 0 ]; then
  echo "Déploiement réussi"
else
  echo "Erreur lors du déploiement"
fi
