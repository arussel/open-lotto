# Accounts
## Pot Manager
### PK
### PK
### variables
- tuple of 2 timestamps

## Pot
### PK
- pot number
### variables
- number of participants
- pot number
- start timestamp
- end timestamp
- proof of randomness request
- winner ticket number
- status: Created -> Open -> Closed -> Draw Requested -> Drawn
- created == start timestamp is in the future
- Open == now is between start and end
- Closed == now is after end
- Drawn == lamport is 0 This is also good if noone has played in this pot

## Ticket
### PK
- pot number
- participant number
### variables
- user account public key

# Instructions
## Initiate Pot
### Called by
- organiser
### arguments
- timestamp of the end of the first pot
- length of the period for the pot
### Prerequisite
- given timestamp is in the future
### accounts
### actions
- create current pot
- create following pot
- set the value in the variables

## Enter Ticket
### Called by
- client library
### Prerequisite
- has Pot Manager address
- get the current pot number from Pot Manager
### accounts
- pot
- treasury
### actions
- verify the pot is still open
- if the post is closed, throw an error and a client will just retry
- add a participant number
- create a ticket account
- transmit 95 % to this pot
- transmit 5 % to treasury

## Draw Result Processing
### Called by
- called by the callback from Switchboard
### Prerequisite
### accounts
### actions
- set pot to Drawn
- send pot to winner

## Next Pot Processing
### Called by
- called by a cron job with the organiser key
### Prerequisite
### accounts
- pot manager
### actions
- set current pot to close
- call switchboard with a random number request adding the just closed pot
- set next pot to open
- create new post set to Created
- set pot manager variable with current pot and next pot


# Questions
## What is the pot number?
It can be the unix timestamp
## When do we draw the winner?
- we call the switchboard from a cron job, the winner is draw from the callback
## What happens when the pot is closed?
- nothing, this just  mean that end_timestamp has passed. There is still an open pot available
- the drawing is done from a cron job

|----------|----------|-----------|
t1         t2         t3          t4
     a          b          c          d
a:
  pot manager has t1 and t2
  client get t1 and t2 and select te because t1 is passed
a: close is called
  pot manager has t2 and t3
  client get t2 because t2 and t3 are in the future and t2 is smaller
=> there is always an open pot
