# בסיס: Node 20 קליל
FROM node:20-alpine

# ספריית עבודה בתוך הקונטיינר
WORKDIR /app

# התקנת חבילות
COPY package*.json ./
RUN npm install --production

# העתקת שאר הקבצים (frontend, server.js, וכו')
COPY . .

# משתנה סביבה
ENV NODE_ENV=production

# הפורט שהאפליקציה מאזינה עליו
EXPOSE 4000

# הפעלת השרת
CMD ["npm", "start"]
