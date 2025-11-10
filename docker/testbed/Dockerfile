FROM nginx:latest

ARG TESTBED_HTML_URL="https://iqb-berlin.github.io/verona-player-testbed"
RUN curl -sSL -o /usr/share/nginx/html/index.html "$TESTBED_HTML_URL"
