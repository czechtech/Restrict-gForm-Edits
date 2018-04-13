var PRUNE_RATE_MINUTES = 30;
var FIRST_ATTEMPT ="(First Attempt)";
// Global Variables: https://stackoverflow.com/questions/24721226/how-to-define-global-variable-in-google-apps-script

/********************************************************
   Installation
 ********************************************************/
function onInstall(e) {
  if(e.authMode != AuthMode.FULL) {
    FormApp.getUi().alert("Not Authorized");
  }
  onOpen(e);
}

/********************************************************
   User Interface
 ********************************************************/
function onOpen(e) {
  var uiMenu = FormApp.getUi().createAddonMenu();
  if (e && e.authMode == ScriptApp.AuthMode.NONE) {
    uiMenu.addItem("Authorize time-restrictions add-on", "onClickAuthorizeRestrictions");
    //uiMenu.addItem("Change restriction for this quiz", "onClickChangeRestrictions");
    uiMenu.addToUi();
  } else {
    var settings = PropertiesService.getDocumentProperties();
    if(settings.getProperty("RESTRICTION_ENABLED") == "true") {
      uiMenu.addItem("Disable time-restriction for this quiz", "onClickDisableRestrictions").addToUi();
    } else {
      uiMenu.addItem("Enable time-restriction for this quiz", "onClickEnableRestrictions").addToUi();
    }
    // Common Menus Items:
    uiMenu.addItem("Insert a login section", "onClickCreateLoginSection");
    uiMenu.addItem("Check and adjust form settings", "onClickAdjustSettings");
    uiMenu.addItem("Select the login question", "onClickSelectLoginQuestion");
    uiMenu.addItem("Refresh access list right now", "onClickRefreshAccessList");
    uiMenu.addToUi();
  }
}
 
function onClickAuthorizeRestrictions(e) {
  // TODO: This may requires a sidebar & html
  //FormApp.getUi().alert('No authorization path has been implemented.');
  onOpen(e);
}

// This is a work-around to onOpen having NO authorization to use PropertyService.getDocumentProperties()
function onClickChangeRestrictions(e) {
  var ui = FormApp.getUi();
  var settings = PropertiesService.getDocumentProperties();
  if(settings.getProperty("RESTRICTION_ENABLED") == 'true') {
    var result = ui.alert('Confirm', 'Disable time restrictions on this quiz?', ui.ButtonSet.YES_NO);
    if (result == ui.Button.YES) {
      onClickDisableRestrictions(e); // alerts user to success
    }
  } else {
    var result = ui.alert('Confirm', 'Enable time restrictions on this quiz?', ui.ButtonSet.YES_NO);
    if (result == ui.Button.YES) {
      onClickEnableRestrictions(e); // alerts user to success
    }
  }
}

function onClickDisableRestrictions(e) {
  var settings = PropertiesService.getDocumentProperties();
  settings.setProperty("RESTRICTION_ENABLED", "false");
  removeTimeTrigger();
  removeSubmitTrigger();
  if(verifyLoginQuestion()) {
    onClickRemoveLoginQuestion();
  }
  onOpen(e); // update the menu options
  FormApp.getUi().alert("Quiz time restrictions disabled.");
}

function onClickEnableRestrictions(e) {
  if(!verifyFormSettings()) {
    onClickAdjustSettings(e);
  }
  if(!verifyLoginQuestion()) {
    onClickSelectLoginQuestion(e);
  }
  if(verifyFormSettings() && verifyLoginQuestion()) {
    var ui = FormApp.getUi();
    var duration = "not a number";
    while(isNaN(duration)) {
      var response = ui.prompt('Time between retakes', 'Minimum time (in hours) between retakes:', ui.ButtonSet.OK);
      duration = parseFloat(response.getResponseText());
    }
    var settings = PropertiesService.getDocumentProperties();
    settings.setProperty("RESTRICTION_DURATION", duration);  // TODO: ask user for this value
    settings.setProperty("RESTRICTION_ENABLED", "true");
    installSubmitTrigger();
    installTimeTrigger();
    onOpen(e); // update the menu options
    ui.alert("Quiz time restrictions enabled.");
  }
}

function onClickRemoveLoginQuestion() { // Not yet available in the menu, but used elsewhere
  if(verifyLoginQuestion()) {
    var form = FormApp.getActiveForm();
    var settings = PropertiesService.getDocumentProperties();
    var ui = FormApp.getUi();
    var question = form.getItemById(settings.getProperty("LOGIN_QUESTION_ID"));
    var result = ui.alert("Remove Login Question", "Remove \""+question.getTitle()+"\"?", ui.ButtonSet.YES_NO);
    if (result == ui.Button.YES) {
      form.deleteItem(settings.getProperty("LOGIN_QUESTION_ID"));
      if(!verifyLoginQuestion()) {
        FormApp.getUi().alert("Login question removed.");
      }
    }
  } else {
    FormApp.getUi().alert("No login question assigned.");
  }
}

function onClickCreateLoginSection(e) {
  addLoginSection();
  if(verifyLoginQuestion()) {
    FormApp.getUi().alert("Login section/question added.");
  } else {
    FormApp.getUi().alert("Failed to add login section/question.");
  }
}

function onClickRefreshAccessList(e) {
  if(verifyLoginQuestion()) {
    var result = refreshLoginChoices();
    if(result == false) {
      FormApp.getUi().alert("Failed to refresh access list");
    } else {
      FormApp.getUi().alert("Logins refreshed");
    }
  } else {
    FormApp.getUi().alert("No login question found in quiz.");
  }
}

function onClickSelectLoginQuestion(e) {
  // TODO: Ask the form owner to select the login question from the list of listItems
  var form = FormApp.getActiveForm();
  var ui = FormApp.getUi();
  if(form.getItems(FormApp.ItemType.LIST).length < 1) {
    var result = ui.alert('Add Login Question', 'No Dropdown questions within this quiz.  Add a new login question?', ui.ButtonSet.YES_NO);
    if (result == ui.Button.YES) {
      onClickCreateLoginSection(e); // this will add then set the login question
    }
  } else {
    // TODO this is very limiting
    var item = form.getItems(FormApp.ItemType.LIST)[0];
    var settings = PropertiesService.getDocumentProperties();
    var result = ui.alert("Select Login Question","Use the first Dropdown question:\n   \""+item.getTitle()+"\"", ui.ButtonSet.YES_NO);
    if (result == ui.Button.YES) {
      settings.setProperty("LOGIN_QUESTION_ID", item.getId());
    }
  }
}

function onClickAdjustSettings(e) {
  if(!verifyFormSettings()) {
    var result = ui.alert('Adjust Form Settings', 'This will...\n * Allow Response Edits\n * Collect Emails\n * Require Login\n * Mark it as a Quiz\n\nContinue?', ui.ButtonSet.YES_NO);
    if (result == ui.Button.YES) {
      adjustFormSettings();
      if(!verifyFormSettings()) {
        FormApp.getUi().alert("Form settings adjusted.");
      }    
    }
  } else {
    FormApp.getUi().alert("Form settings are compatible.");
  } 
}


/********************************************************
   Add/Remove Triggers
 ********************************************************/
function installSubmitTrigger() {
  var settings = PropertiesService.getDocumentProperties();
  var form = FormApp.getActiveForm();
  if(settings.getProperty("SUBMIT_TRIGGER_ID") != null) {
    //throw ("Installing onFormSubmit trigger without removing prior.");
  }
  var submitTrigger = ScriptApp.newTrigger("onFormSubmit").forForm(form).onFormSubmit().create();
  settings.setProperty("SUBMIT_TRIGGER_ID", submitTrigger.getUniqueId());
}

function removeSubmitTrigger() {
  var settings = PropertiesService.getDocumentProperties();
  var submitTrigger = settings.getProperty("SUBMIT_TRIGGER_ID");  
  var form = FormApp.getActiveForm();
  triggers = ScriptApp.getUserTriggers(form);
  triggers.forEach(function(trigger) {
    if(trigger.getUniqueId() == submitTrigger) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  settings.deleteProperty("SUBMIT_TRIGGER_ID");
}

function installTimeTrigger() {
  var settings = PropertiesService.getDocumentProperties();
  if(settings.getProperty("TIME_TRIGGER_ID") != null) {
    //throw ("Installing timeBased trigger without removing prior.");
  }
  var form = FormApp.getActiveForm();
  timeTrigger = ScriptApp.newTrigger("onTimeToRefreshLogins").timeBased().everyMinutes(PRUNE_RATE_MINUTES).create();
  settings.setProperty("TIME_TRIGGER_ID", timeTrigger.getUniqueId());
}

function verifyTimeTrigger() {
  // TODO: This should be more robust
  var settings = PropertiesService.getDocumentProperties();
  if(settings.getProperty("TIME_TRIGGER_ID") != null) {
    return true;
  }
  return false;
}

function removeTimeTrigger() {
  var settings = PropertiesService.getDocumentProperties();
  var timeTrigger = settings.getProperty("TIME_TRIGGER_ID");
  var form = FormApp.getActiveForm();
  triggers = ScriptApp.getUserTriggers(form);
  triggers.forEach(function(trigger) {
    if(trigger.getUniqueId() == timeTrigger) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  settings.deleteProperty("TIME_TRIGGER_ID");
}


/********************************************************
   Form Settings / (login) Sections
 ********************************************************/
function verifyFormSettings() {
  var form = FormApp.getActiveForm();
  if(form.canEditResponse() == true &&
     form.collectsEmail() == true &&
     form.isQuiz() == true &&
     form.hasLimitOneResponsePerUser() == true &&
     form.requiresLogin() == true) {
    return true;
  }
  return false;
}

function adjustFormSettings() {
  var form = FormApp.getActiveForm();
  form.setAllowResponseEdits(true);
  form.setCollectEmail(true);
  form.setIsQuiz(true);
  form.setLimitOneResponsePerUser(true);
  form.setRequireLogin(true);
}

function addLoginSection() {
  var form = FormApp.getActiveForm();
  var settings = PropertiesService.getDocumentProperties();
  if(form.getItems()[0].getType() != FormApp.ItemType.PAGE_BREAK) {
    var sectionbreak = form.addPageBreakItem();
    form.moveItem(sectionbreak.getIndex(), 0);
  }
  var item = form.addListItem();
  item.setTitle("Quiz Login: Select your email address, or choose \'First Attempt\':");
  if(settings.getProperty("RESTRICTION_DURATION") != null) {
    item.setHelpText("(Re-takes are enabled "+settings.getProperty("RESTRICTION_DURATION")+" hours after submission.)");
  }
  item.setRequired(true);
  // TODO: item.setPoints(0);
  form.moveItem(item.getIndex(), 0);
  settings.setProperty("LOGIN_QUESTION_ID", item.getId());
  onClickRefreshAccessList(); // this will display an alert if it fails
}

function verifyLoginQuestion() {
  var form = FormApp.getActiveForm();
  var settings = PropertiesService.getDocumentProperties();
  var loginQuestionID = settings.getProperty("LOGIN_QUESTION_ID");
  if(loginQuestionID != null && form.getItemById(loginQuestionID) != null) {
    var item = form.getItemById(loginQuestionID);
    if(item.getType() == FormApp.ItemType.LIST) {
      // TODO: Verify the item settings (0 points, required, determines next section)
      return true;
    } else {
      settings.deleteProperty("LOGIN_QUESTION_ID")
    }
  }
  return false;
}


/********************************************************
   Login Emails / Timed Refreshes
 ********************************************************/
function onTimeToRefreshLogins(e) {
  if(verifyAuthorization()) {
    var result = refreshLoginChoices();
    if(result == false) {
      emailAlert("Time-restricted Form Edits Script Error: onTimeToRefreshLogins", "onTimeToRefreshLogins has failed with an error.");
    }
    var preventedEmails = listPreventedLogins();
    if(preventedEmails.length == 0) {
      removeTimeTrigger();
    }
  }
}

function refreshLoginChoices() {
  var form = FormApp.getActiveForm();
  var settings = PropertiesService.getDocumentProperties();
  if(verifyLoginQuestion()) {
    var loginQuestionID = settings.getProperty("LOGIN_QUESTION_ID");
    var item = form.getItemById(loginQuestionID);
    var listItem = item.asListItem();
    var permittedEmails = listPermissibleLogins();
    var preventedEmails = listPreventedLogins();
    var choices = [];
    permittedEmails.forEach(function(email) {
      var newChoice = listItem.createChoice(email, FormApp.PageNavigationType.CONTINUE);
      choices.push(newChoice);
    });
    preventedEmails.forEach(function(email) {
      var newChoice = listItem.createChoice(email, FormApp.PageNavigationType.SUBMIT);
      choices.push(newChoice);
    });
    listItem.setChoices(choices);
    return true;
  }
  return false;
}

function listPermissibleLogins() {
  // TODO: Pull from a Google Classroom all students who the Quiz has been assigned to, then remove any that have taken it too recently
  var form = FormApp.getActiveForm();
  var settings = PropertiesService.getDocumentProperties();
  var allResponses = form.getResponses();
  var cutoff = new Date(Date.now().valueOf() - 3.61e6*settings.getProperty("RESTRICTION_DURATION"));
  var permissibleRetakeLogins = [];
  permissibleRetakeLogins.push(FIRST_ATTEMPT); // PLACE-HOLDER until all possibilities can be enumerated.
  allResponses.forEach(function(response) {
    if(response.getTimestamp() < cutoff) {
      permissibleRetakeLogins.push(response.getRespondentEmail());
    }
  });
  return permissibleRetakeLogins;  
}

function listPreventedLogins() {
  var form = FormApp.getActiveForm();
  var settings = PropertiesService.getDocumentProperties();
  var allResponses = form.getResponses();
  var cutoff = new Date(Date.now().valueOf() - 3.61e6*settings.getProperty("RESTRICTION_DURATION"));
  var unpermissibleLogins= [];
  allResponses.forEach(function(response) {
    if(response.getTimestamp() > cutoff) {
      unpermissibleLogins.push(response.getRespondentEmail());
    }
  });
  return unpermissibleLogins;  
}


/********************************************************
   Form Submissions
 ********************************************************/
function onFormSubmit(e) {
  if(verifyAuthorization()) {
    var settings = PropertiesService.getDocumentProperties();
    // Verify Restrictions Are Functional:
    if(settings.getProperty("RESTRICTION_ENABLED") != "true") {
      removeSubmitTrigger();
    }
    processSubmission(e.response);
  }
}

function processSubmission(response) {  
  if(!verifyLoginQuestion()) {
    emailAlert("Time-restricted Quiz Edits Error", "Submission occurred while form did not have a login question.");
    return false; // Cannot properly process this without the login question
  }
  if(!verifyFormSettings()) {
    emailAlert("Time-restricted Quiz Edits Error", "Submission occurred while form did not have the proper settings.");
    return false; // Single submission, collecting email, etc. are required for this to function
  }

  // Start the automatic refreshes if not already active
  if(!verifyTimeTrigger()) {
    installTimeTrigger();
  }

  // Disable submitter's access
  refreshLoginChoices();
  
  // Check & Report mismatched login/email addresses
  var form = FormApp.getActiveForm(); // e.source
  var settings = PropertiesService.getDocumentProperties();
  var id = settings.getProperty("LOGIN_QUESTION_ID"); // Status verified above
  var item = form.getItemById(id); // Status verified above 
  var respondentsEmail = response.getRespondentEmail(); // .toUpperCase().trim()
  var submittedEmail = response.getResponseForItem(item).getResponse(); // .toUpperCase().trim()
  if(submittedEmail != respondentsEmail && submittedEmail != FIRST_ATTEMPT) {
    emailAlert("Mismatched email on Form Submission", "Submission from: "+respondentsEmail+"\nClaiming to be: "+submittedEmail);
    return false;
  }
  
  // Report quizzes retaken too soon -- Not needed
  if(listPreventedLogins().indexOf(respondentsEmail) >= 0) {
  var submitTime = response.getTimestamp();
  var nowTime = new Date(Date.now());
    emailAlert("Quiz Retake Too Soon","Submission from: "+respondentsEmail+"\nSubmitted at: "+nowTime+"\nPrevious submission at: "+submitTime);
    return false;
  }
  return true;
}


/********************************************************
   Authorization
 ********************************************************/
function verifyAuthorization() {
  var authInfo = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL); // LIMITED??
  if (authInfo.getAuthorizationStatus() == ScriptApp.AuthorizationStatus.REQUIRED) {
    sendReauthorizationRequest();
    return false;
  }
  return true;
}

function sendReauthorizationRequest() {
  var settings = ScriptService.getDocumentProperties();
  var authInfo = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
  var lastAuthEmailDate = settings.getProperty('lastAuthEmailDate');
  var today = new Date().toDateString();
  if (lastAuthEmailDate != today) {
    if (MailApp.getRemainingDailyQuota() > 0) {
      var template = HtmlService.createTemplateFromFile('AuthorizationEmail');
      template.url = authInfo.getAuthorizationUrl();
      template.notice = NOTICE;
      var message = template.evaluate();
      MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
          'Authorization Required',
          message.getContent(), {
            name: ADDON_TITLE,
            htmlBody: message.getContent()
          });
    }
    settings.setProperty('lastAuthEmailDate', today);
  }
}


/********************************************************
   Email Messages
 ********************************************************/
function emailAlert(subject, message) {
  var form = FormApp.getActiveForm();
  var ownerEmail = form.getEditors()[0].getEmail();
  var formName = form.getTitle();
  var formURL = form.getEditUrl();
  MailApp.sendEmail(ownerEmail, subject, formName+"\n\n"+message+"\n\n\n"+formURL);
}

// TODO: Display list of active time-restrictions
// TODO: Implement the default "Help" menu item
// TODO: New Forms Add-On: **Auto "Import Grades" upon every submission**
// TODO: Possible New Add-On: Max Score/Scale Score/Ceiling/Floor 
// TODO: Store a count of submissions per user in the Form's Settings?
