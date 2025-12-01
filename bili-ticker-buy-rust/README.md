# BiliTickerBuy Rust Refactor

This is a refactored version of BiliTickerBuy using Rust (Tauri) and React.

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/)

## Setup

1. Install frontend dependencies:

   ```bash
   npm install
   ```

2. Run the development server:

   ```bash
   npm run tauri dev
   ```

## Structure

- `src/`: Frontend code (React + Vite)
- `src-tauri/`: Backend code (Rust)
  - `src/main.rs`: Entry point
  - `src/auth.rs`: Authentication logic
  - `src/util.rs`: Utilities (including CTokenGenerator)
  - `src/buy.rs`: Ticket buying logic (placeholder)

## Features Implemented

- Project structure setup
- CTokenGenerator port to Rust
- Basic Authentication (QR Code generation and polling)
- Basic UI with React and Tailwind CSS

## To Do

- Complete the ticket buying logic in `src-tauri/src/buy.rs`.
- Implement configuration management.
- Enhance the UI with more features (ticket selection, logs, etc.).
