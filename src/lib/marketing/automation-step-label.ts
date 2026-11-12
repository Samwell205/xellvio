/** Human labels for automation node types, shared by template cards and detail pages. */
export function stepLabel(type: string) {
  const map: Record<string, string> = {
    "trigger.contact_added": "Trigger: contact added",
    "trigger.keyword": "Trigger: keyword received",
    "trigger.link_click": "Trigger: link clicked",
    "trigger.tag_added": "Trigger: tag added",
    "trigger.date": "Trigger: date reached",
    "trigger.list_join": "Trigger: joined a list",
    "trigger.form_submitted": "Trigger: form submitted",
    "logic.check_consent": "Check messaging consent",
    "logic.clicked_link": "Condition: clicked a link",
    "logic.exit": "Exit the journey",
    "action.send_sms": "Send SMS",
    "action.add_tag": "Add a tag",
    "action.remove_tag": "Remove a tag",
    "action.add_to_list": "Add to a list",
    "action.webhook": "Call a webhook",
    "timing.wait": "Wait",
  };
  return map[type] ?? type.replace(/^[a-z]+\./, "").replace(/_/g, " ");
}
