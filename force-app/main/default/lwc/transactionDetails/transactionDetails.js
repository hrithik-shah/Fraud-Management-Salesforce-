import { LightningElement, wire } from 'lwc';
import { subscribe, publish, MessageContext } from 'lightning/messageService';
import TRANSACTION_SELECTED_CHANNEL from '@salesforce/messageChannel/TransactionSelected__c';

export default class TransactionDetails extends LightningElement {
    transactionId;
    subscription = null;

    @wire(MessageContext)
    messageContext;

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