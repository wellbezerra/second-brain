---
title: Old laptop setup
status: archived
---

# Old laptop setup

Kept for reference; this ThinkPad was retired in 2025.

## Steps

1. Install Fedora and enable full-disk encryption.
2. Clone the dotfiles repository and run the bootstrap script.
3. Install Node through nvm and pin the version from `.nvmrc`.
4. Restore SSH keys from the encrypted backup drive.
5. Set up the nightly backup to the external disk with restic.

## Problems

The trackpad driver needed a kernel parameter to stop phantom clicks, and the
fingerprint reader never worked.
