# Glossary

The ubiquitous language of App Template's example domain: an anonymous chat with an assistant,
the way ChatGPT or Claude works before signing in. Code, tickets and docs use these words; the
`_Avoid_` lists name the synonyms that are banned.

## Chat

**User**:
An anonymous browser the api recognises by a secret it issued on first contact; the owner of chats.
Not an account: there is nothing to sign in to.
_Avoid_: Visitor, account, anonymous user, device, session

**User secret**:
The credential the api issues to a user on first contact and recognises them by afterwards. Only
the user's browser holds it.
_Avoid_: Token, session id, api key, cookie (the cookie carries it; it is not the secret)

**Chat**:
A conversation between one user and the assistant: an ordered list of messages, with an optional
title. A chat is `generating` while an assistant message is not yet terminal, otherwise `idle`.
_Avoid_: Conversation, thread, dialogue, session

**Message**:
One turn in a chat, authored by the user or by the assistant, with text and zero or more
attachments. A user's message is complete when sent; an assistant's message is born `queued` and
moves through the message stages.
_Avoid_: Prompt, reply, completion, turn

**Message stage**:
Where an assistant message is in its life: `queued` (the chat has asked for it), `preparing`
(the assistant is reading the chat), `generating` (the assistant is writing; the text grows),
`completed`, or `failed` (the assistant gave up; the message carries a reason). The last two are
terminal.
_Avoid_: State, status, in-progress, pending, streaming

**Title**:
The short name of a chat, shown in the user's chat list. The assistant proposes one from the
first message unless the user has already set one; a user's title is never overwritten.
_Avoid_: Name, subject, summary

**Attachment**:
A file a user uploaded, or one produced for an assistant message. A user's attachment is bound
to a message when that message is sent; until then only its owner can see it.
_Avoid_: File, upload, document, media, draft

**Placeholder**:
A marker inside a message's text that stands for one of its attachments; the web app renders the
attachment in its place.
_Avoid_: Template variable, token, embed, slot

**Assistant**:
The language-model side of a chat, as the user sees it. The model behind it is a provider's
artefact and is named only in `infrastructure`.
_Avoid_: Bot, AI, agent, model
