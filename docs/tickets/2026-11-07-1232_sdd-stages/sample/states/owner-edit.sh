# shellcheck shell=sh disable=SC2016 # its quotes hold JavaScript
# owner-edit: stage-1-done with one line of the ticket's code edited by hand and left
# uncommitted, as the owner leaves it between rounds (R22).
build stage-1-done
replace .misc/tickets/ticket.mjs \
  '    console.error(`make ${command} TITLE="<title>": TITLE is empty`)' \
  '    console.error(`make ${command} needs a title: TITLE="<title>"`)'
