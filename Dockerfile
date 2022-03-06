FROM git-client-deps

WORKDIR /app

ADD . /app

CMD node --max_old_space_size=128 scripts/test-parse