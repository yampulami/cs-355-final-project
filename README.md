# ReceiptTrack - Purchase & Return Tracker

A web application that helps users track purchases, store receipts, and manage return deadlines. Features AI-powered receipt scanning using Google Gemini to auto-populate receipt details from photos.

Demo: https://youtu.be/494a7g40F-4

## How It Works

1. **Register/Login** - Create an account or sign in. Passwords are hashed with bcrypt and a JWT token is issued for session management.
2. **Add Receipts** - Manually fill in receipt details or use the AI scan feature to upload/photograph a receipt. The Gemini API extracts store name, items, prices, date, and category.
3. **Track Returns** - Set return deadlines on receipts. The dashboard and receipt list show countdown timers with color-coded urgency.
4. **Dashboard** - View spending summaries, items expiring soon, and category breakdowns at a glance.
5. **Profile** - Update account details, change password, or delete your account.

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript (no frameworks)
- **Backend**: Node.js, Express.js
- **Database**: NeDB (file-based, no external database server required)
- **Authentication**: bcrypt for password hashing, JWT for session tokens
- **AI**: Google Gemini 2.5 Flash API for receipt image analysis

## Setup & Run

1. Clone the repository:

   ```bash
   git clone https://github.com/yampulami/cs-355-final-project.git
   cd cs-355-final-project
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory:

   ```
   JWT_SECRET=your_secret_key_here
   PORT=3000
   GEMINI_KEY=your_google_gemini_api_key
   ```

4. Start the server:

   ```bash
   npm start
   ```

5. Open `http://localhost:3000` in your browser
