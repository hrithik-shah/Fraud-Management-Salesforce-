import { LightningElement, wire, track } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getPendingTransactions from '@salesforce/apex/PartnerTransactionController.getPendingTransactions';
import updateTransactionStatuses from '@salesforce/apex/PartnerTransactionController.updateTransactionStatuses';
import { publish, subscribe, MessageContext, APPLICATION_SCOPE } from 'lightning/messageService';
import TRANSACTION_SELECTED_CHANNEL from '@salesforce/messageChannel/TransactionSelected__c';
import TRANSACTION_UPDATED_CHANNEL from '@salesforce/messageChannel/TransactionUpdated__c'; 

const COLUMNS = [
    { label: 'Transaction ID', fieldName: 'Transaction_ID__c' },
    { label: 'Product Code', fieldName: 'Product_Code__c' },
    { label: 'Store Location', fieldName: 'Store_Location__c' },
    { label: 'Date', fieldName: 'Transaction_Date__c', type: 'date' },
    { label: 'Amount', fieldName: 'Amount__c', type: 'currency' },
    {
        type: 'action',
        typeAttributes: {
            rowActions: [
                { label: 'View Details', name: 'view_details', iconName: 'utility:preview' },
                { label: 'Approve', name: 'approve_txn', iconName: 'utility:check' },
                { label: 'Cancel', name: 'cancel_txn', iconName: 'utility:close' },
                { label: 'Mark Fraudulent', name: 'fraud_txn', iconName: 'utility:warning' }
            ]
        }
    }
];

export default class UnprocessedTransactions extends LightningElement {
    columns = COLUMNS;
    @track transactions;
    @track error;
    
    selectedRows = [];
    currentSelectedId = null; 
    wiredTransactionResult;
    subscription = null;

    @wire(MessageContext)
    messageContext;

    get isBulkDisabled() {
        return this.selectedRows.length === 0;
    }

    connectedCallback() {
        this.subscription = subscribe(
            this.messageContext,
            TRANSACTION_SELECTED_CHANNEL,
            (message) => this.handleMessage(message),
            { scope: APPLICATION_SCOPE }
        );
    }

    handleMessage(message) {
        if (message.action === 'approve_txn' && message.transactionId) {
            this.processUpdates([message.transactionId], 'Approved');
        } else if (message.action === 'cancel_txn' && message.transactionId) {
            this.processUpdates([message.transactionId], 'Cancelled');
        } else if (message.action === 'fraud_txn' && message.transactionId) {
            this.processUpdates([message.transactionId], 'Fraudulent');
        }
    }

    @wire(getPendingTransactions)
    wiredTransactions(result) {
        this.wiredTransactionResult = result;
        if (result.data) {
            this.transactions = result.data;
            this.error = undefined;

            if (this.transactions.length > 0) {
                const isValid = this.transactions.some(txn => txn.Id === this.currentSelectedId);
                if (!isValid) {
                    this.currentSelectedId = this.transactions[0].Id;
                }
                this.publishSelection(this.currentSelectedId);
            } else {
                this.currentSelectedId = null;
                this.publishSelection(null);
            }
        } else if (result.error) {
            this.error = result.error.body.message;
            this.transactions = undefined;
        }
    }

    publishSelection(txnId) {
        publish(this.messageContext, TRANSACTION_SELECTED_CHANNEL, { action: 'select', transactionId: txnId });
    }

    handleRowSelection(event) {
        this.selectedRows = event.detail.selectedRows.map(row => row.Id);
    }

    handleRowAction(event) {
        const actionName = event.detail.action.name;
        const rowId = event.detail.row.Id;
        
        if (actionName === 'view_details') {
            this.currentSelectedId = rowId;
            this.publishSelection(rowId);
        } else if (actionName === 'approve_txn') {
            this.processUpdates([rowId], 'Approved');
        } else if (actionName === 'cancel_txn') {
            this.processUpdates([rowId], 'Cancelled');
        } else if (actionName === 'fraud_txn') {
            this.processUpdates([rowId], 'Fraudulent');
        }
    }

    handleBulkApprove() {
        this.processUpdates(this.selectedRows, 'Approved');
    }

    handleBulkCancel() {
        this.processUpdates(this.selectedRows, 'Cancelled');
    }

    handleBulkFraud() {
        this.processUpdates(this.selectedRows, 'Fraudulent');
    }

    processUpdates(recordIds, newStatus) {
        updateTransactionStatuses({ transactionIds: recordIds, newStatus: newStatus })
            .then(() => {
                this.dispatchEvent(
                    new ShowToastEvent({ title: 'Success', message: `${recordIds.length} transaction(s) marked as ${newStatus}.`, variant: 'success' })
                );
                
                this.selectedRows = [];
                this.template.querySelector('lightning-datatable').selectedRows = [];
                
                publish(this.messageContext, TRANSACTION_UPDATED_CHANNEL, {});
                
                if (recordIds.includes(this.currentSelectedId)) {
                    const currentIndex = this.transactions.findIndex(txn => txn.Id === this.currentSelectedId);
                    if (currentIndex !== -1 && this.transactions.length > 1) {
                        const nextIndex = (currentIndex < this.transactions.length - 1) ? currentIndex + 1 : currentIndex - 1;
                        this.currentSelectedId = this.transactions[nextIndex].Id;
                    } else {
                        this.currentSelectedId = null;
                    }
                }
                
                return refreshApex(this.wiredTransactionResult);
            })
            .catch(error => {
                this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: error.body ? error.body.message : error.message, variant: 'error' }));
            });
    }
}