Git terminology can be confusing. I have attempted to match the git internal names where possible, so it's easier to compare with the relevant part of the git docs. The most important thing to note is that everything is from the perspective of the server, not the client, so:

- An "upload request" is a request sent from the client to the server that asks the server to "upload" data to the client. This is what is sent by "fetch" or "pull" commands
