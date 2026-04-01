#!/usr/bin/env bash
# Setup script for sentiment-arbitrage worker on Raspberry Pi
# Run as: bash setup-pi.sh
set -euo pipefail

REPO_DIR="$HOME/sentiment-arbitrage"
WORKER_DIR="$REPO_DIR/worker"

echo "=== Step 1: Clone repo ==="
if [ -d "$REPO_DIR" ]; then
    echo "Repo already exists at $REPO_DIR, pulling latest..."
    cd "$REPO_DIR" && git pull
else
    git clone https://github.com/nicolovejoy/sentiment-arbitrage.git "$REPO_DIR"
fi

echo ""
echo "=== Step 2: Create Python venv ==="
cd "$WORKER_DIR"
if [ ! -d venv ]; then
    python3 -m venv venv
fi
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt
echo "Python dependencies installed."

echo ""
echo "=== Step 3: Download FinBERT model ==="
echo "This downloads ~400MB on first run. Be patient..."
./venv/bin/python -c "
from transformers import BertForSequenceClassification, BertTokenizer
print('Downloading FinBERT model...')
BertForSequenceClassification.from_pretrained('ProsusAI/finbert')
BertTokenizer.from_pretrained('ProsusAI/finbert')
print('Model cached successfully.')
"

echo ""
echo "=== Step 4: Check .env file ==="
if [ ! -f "$WORKER_DIR/.env" ]; then
    cat > "$WORKER_DIR/.env" <<'ENVEOF'
FINNHUB_API_KEY=
GOOGLE_APPLICATION_CREDENTIALS_JSON=
FIRESTORE_PROJECT_ID=sentiment-arbitrage
ENVEOF
    echo "Created $WORKER_DIR/.env — you MUST fill in the secrets before running."
    echo "  Edit: nano $WORKER_DIR/.env"
else
    echo ".env already exists."
fi

echo ""
echo "=== Step 5: Install systemd units ==="
sudo cp "$WORKER_DIR/sentiment-worker.service" /etc/systemd/system/
sudo cp "$WORKER_DIR/sentiment-worker.timer" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable sentiment-worker.timer
echo "Timer enabled. NOT started yet — fill in .env first, then test."

echo ""
echo "=== Done ==="
echo ""
echo "Next steps:"
echo "  1. Edit secrets:  nano $WORKER_DIR/.env"
echo "  2. Test manually:  sudo systemctl start sentiment-worker"
echo "  3. Check logs:     journalctl -u sentiment-worker -f"
echo "  4. Start timer:    sudo systemctl start sentiment-worker.timer"
echo "  5. Verify timer:   systemctl list-timers sentiment-worker.timer"
