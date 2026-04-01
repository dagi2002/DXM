#!/bin/bash
# Start the API in the background
npm run dev -w apps/api &
API_PID=$!

# Start the frontend (Vite on port 5000)
npm run dev -w apps/web

# If frontend exits, kill API too
kill $API_PID 2>/dev/null
