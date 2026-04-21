# Open Wallet Standard (OWS) — NHS hackathon use case

**In-app:** **`/nhs/ows`** — copy-paste install and next steps for the **`ows`** CLI from the official installer.

**Upstream:** [Open Wallet Standard](https://github.com/open-wallet-standard/core) — installer script hosted at **[docs.openwallet.sh/install.sh](https://docs.openwallet.sh/install.sh)**.

## Install (official script)

```bash
curl -fsSL https://docs.openwallet.sh/install.sh | bash
```

The script:

- Downloads a prebuilt **`ows`** binary for your OS/arch (Linux/macOS, x86_64/aarch64) when available, or **builds from source** with Rust/cargo.
- Installs the binary to **`~/.ows/bin/ows`** (override with env **`OWS_INSTALL_DIR`**).
- Optionally installs **Python** (`open-wallet-standard`) and **Node** (`@open-wallet-standard/core`) bindings when `python3` / `node`+`npm` are present.
- Best-effort install of the **OWS agent skill** into detected coding-agent config dirs (Cursor, Copilot, Claude Code, etc.).

After install, reload your shell (or `source ~/.zshrc` / `~/.bashrc`) and run:

```bash
ows --help
```

## Relationship to Clinical Tempo

- **Browser flows** in this app use **injected wallets** (e.g. MetaMask) + Tempo — standard web3 UX.
- **OWS** targets **agent / CLI** and **standard wallet interfaces** for automation and interoperability — useful for hackathon demos where agents or scripts manage keys and signing outside the browser.

This page is **education only**; follow upstream docs for production wallet security.
