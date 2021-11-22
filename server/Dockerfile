#
# Builder stage.
# This state compile our TypeScript to get the JavaScript code
#
FROM node AS builder

WORKDIR /usr/src/app

COPY package.json yarn.lock ./
COPY tsconfig*.json ./
COPY ./src ./src

RUN yarn install --pure-lockfile
RUN yarn build

#
# Production stage.
# This state compile get back the JavaScript code from builder stage
# It will also install the production package only
#
FROM node:alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json yarn.lock ./
RUN yarn install --pure-lockfile --production

## We just need the build to execute the command
COPY --from=builder /usr/src/app/build ./build
CMD ["node", "/app/build/index.js"]