# Glossary

The ubiquitous language of App Template's example domain: an anonymous chat with an assistant,
the way ChatGPT or Claude works before signing in. Code, tickets and docs use these words; the
`_Avoid_` lists name the synonyms that are banned.

## Chat

**Visitor**:
An anonymous browser the api recognises by a secret it issued on first contact; the owner of chats.
Not an account: there is nothing to sign in to.
_Avoid_: User, account, anonymous user, device, session

**Chat**:
A conversation between one visitor and the assistant: an ordered list of messages.
_Avoid_: Conversation, thread, dialogue, session

**Message**:
One turn in a chat, authored by the visitor or by the assistant, with text and zero or more
attachments.
_Avoid_: Prompt, reply, completion, turn

**Attachment**:
A file bound to one message: uploaded by the visitor, or produced for an assistant message.
_Avoid_: File, upload, document, media

**Placeholder**:
A marker inside a message's text that stands for one of its attachments; the web app renders the
attachment in its place.
_Avoid_: Template variable, token, embed, slot

**Assistant**:
The language-model side of a chat, as the visitor sees it. The model behind it is a provider's
artefact and is named only in `infrastructure`.
_Avoid_: Bot, AI, agent, model
