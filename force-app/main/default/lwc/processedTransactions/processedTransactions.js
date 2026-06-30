import { LightningElement, wire, track } from 'lwc';
import getProcessedTransactions from '@salesforce/apex/PartnerTransactionController.getProcessedTransactions';
import updateTransactionStatuses from '@salesforce/apex/PartnerTransactionController.updateTransactionStatuses';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { publish, subscribe, MessageContext, APPLICATION_SCOPE } from 'lightning/messageService';
import TRANSACTION_SELECTED_CHANNEL from '@salesforce/messageChannel/TransactionSelected__c';
import TRANSACTION_UPDATED_CHANNEL from '@salesforce/messageChannel/TransactionUpdated__c';

const rowActions = [
    { label: 'View Details', name: 'view_details', iconName: 'utility:preview' },
    { label: 'Approve', name: 'approve_txn', iconName: 'utility:check' },
    { label: 'Cancel', name: 'cancel_txn', iconName: 'utility:close' },
    { label: 'Mark Fraudulent', name: 'fraud_txn', iconName: 'utility:warning' }
];

const COLUMNS = [
    { label: 'Transaction ID', fieldName: 'Transaction_ID__c', type: 'text' }, 
    { label: 'Store Location', fieldName: 'Store_Location__c' },
    { label: 'Date', fieldName: 'Transaction_Date__c', type: 'date' },
    { label: 'Amount', fieldName: 'Amount__c', type: 'currency' },
    { label: 'Status', fieldName: 'Status__c' },
    { type: 'action', typeAttributes: { rowActions: rowActions } }
];

export default class ProcessedTransactions extends LightningElement {
    columns = COLUMNS;
    @track transactions;
    
    wiredTransactionsResult; 
    updateSubscription = null;

    @wire(MessageContext)
    messageContext;

    connectedCallback() {
        this.updateSubscription = subscribe(
            this.messageContext,
            TRANSACTION_UPDATED_CHANNEL,
            () => {
                if (this.wiredTransactionsResult) {
                    refreshApex(this.wiredTransactionsResult);
                }
            },
            { scope: APPLICATION_SCOPE } 
        );
    }

    @wire(getProcessedTransactions)
    wiredTransactions(result) {
        this.wiredTransactionsResult = result; 
        
        if (result.data) {
            this.transactions = result.data;
        } else if (result.error) {
            console.error('Error fetching processed transactions', result.error);
        }
    }

    handleRowAction(event) {
        const actionName = event.detail.action.name;
        const rowId = event.detail.row.Id;

        if (actionName === 'view_details') {
            publish(this.messageContext, TRANSACTION_SELECTED_CHANNEL, { action: 'select', transactionId: rowId });
        } else if (actionName === 'approve_txn') {
            this.processUpdates([rowId], 'Approved');
        } else if (actionName === 'cancel_txn') {
            this.processUpdates([rowId], 'Cancelled');
        } else if (actionName === 'fraud_txn') {
            this.processUpdates([rowId], 'Fraudulent');
        }
    }

    processUpdates(recordIds, newStatus) {
        updateTransactionStatuses({ transactionIds: recordIds, newStatus: newStatus })
            .then(() => {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Success',
                        message: `Transaction(s) marked as ${newStatus}.`,
                        variant: 'success'
                    })
                );
                
                publish(this.messageContext, TRANSACTION_UPDATED_CHANNEL, {});
                
                return refreshApex(this.wiredTransactionsResult);
            })
            .catch(error => {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Error updating records',
                        message: error.body ? error.body.message : error.message,
                        variant: 'error'
                    })
                );
            });
    }
}