// Every Slack DOM selector lives here. Each entry is a list of fallbacks,
// tried in order. If Slack changes its markup, fix only this file.
globalThis.SLACK_REVIEW_SELECTORS = {
  composer: [
    '[data-qa="message_input"] .ql-editor',
    '.ql-editor[contenteditable="true"]',
    '[contenteditable="true"][role="textbox"]'
  ],
  composerBox: [
    '[data-qa="message_input"]',
    '.p-message_input',
    '.c-wysiwyg_container'
  ],
  sendButton: [
    '[data-qa="texty_send_button"]',
    'button[aria-label^="Send"]',
    'button[aria-label^="Enviar"]'
  ],
  messageContainer: [
    '[data-qa="message_container"]',
    '.c-message_kit__message'
  ],
  sender: [
    '[data-qa="message_sender_name"]',
    '.c-message__sender_link'
  ],
  messageText: [
    '.c-message_kit__blocks',
    '.p-rich_text_section',
    '[data-qa="message-text"]'
  ],
  threadPane: [
    '[data-qa="threads_flexpane"]',
    '[data-qa="thread_view"]',
    '.p-threads_flexpane',
    '.p-flexpane'
  ],
  mainPane: [
    '[data-qa="message_pane"]',
    '.p-message_pane',
    '.p-workspace__primary_view_body',
    '[role="main"]'
  ],
  autocomplete: [
    '[role="listbox"]',
    '.c-texty_autocomplete',
    '[data-qa="tab_complete_ui"]'
  ],
  composerLink: [
    'a[href^="http"]',
    'a[data-stringify-link]'
  ],
  entity: [
    '.ql-mention',
    '[data-stringify-type="mention"]',
    'ts-mention',
    '.c-member_slug',
    '[data-stringify-type="channel"]'
  ]
};
