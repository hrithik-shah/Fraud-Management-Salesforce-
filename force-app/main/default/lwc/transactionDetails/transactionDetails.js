import { LightningElement, wire } from 'lwc';
import { subscribe, publish, MessageContext } from 'lightning/messageService';
import TRANSACTION_SELECTED_CHANNEL from '@salesforce/messageChannel/TransactionSelected__c';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';

import CUSTOMER_ID_FIELD from '@salesforce/schema/Transaction__c.Card__r.Customer_Contact__r.Customer_ID__c';
import MASKED_CARD_FIELD from '@salesforce/schema/Transaction__c.Card__r.Masked_Card_Number__c';

const FIELDS = [CUSTOMER_ID_FIELD, MASKED_CARD_FIELD];

export default class TransactionDetails extends LightningElement {
    transactionId;
    subscription = null;

    @wire(MessageContext)
    messageContext;

    @wire(getRecord, { recordId: '$transactionId', fields: FIELDS })
    transactionRecord;

    get customerId() {
        return getFieldValue(this.transactionRecord.data, CUSTOMER_ID_FIELD);
    }

    get maskedCard() {
        return getFieldValue(this.transactionRecord.data, MASKED_CARD_FIELD);
    }

    connectedCallback() {
        this.subscription = subscribe(
            this.messageContext,
            TRANSACTION_SELECTED_CHANNEL,
            (message) => this.handleMessage(message)
        );
    }

    handleMessage(message) {
        if (message.action === 'select') {
            this.transactionId = message.transactionId;
        }
    }

    publishAction(actionName) {
        publish(this.messageContext, TRANSACTION_SELECTED_CHANNEL, { 
            action: actionName, 
            transactionId: this.transactionId 
        });
    }

    handleApprove() {
        this.publishAction('approve_txn');
    }

    handleCancel() {
        this.publishAction('cancel_txn');
    }

    handleFraud() {
        this.publishAction('fraud_txn');
    }
}