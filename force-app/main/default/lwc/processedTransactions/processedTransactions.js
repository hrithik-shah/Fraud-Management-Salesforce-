import { LightningElement, wire, track } from 'lwc';
import getPaginatedTransactions from '@salesforce/apex/TransactionPaginationController.getPaginatedTransactions';
import updateTransactionStatuses from '@salesforce/apex/PartnerTransactionController.updateTransactionStatuses';
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
    @track transactions = [];
    
    pageSize = 50;
    currentPage = 1;
    totalRecords = 0;
    @track enableInfiniteLoading = true;
    isLoading = false;
    
    filtersJSON = JSON.stringify({ Status__c: ['Approved', 'Cancelled', 'Fraudulent'] });
    sortsJSON = '[]';

    updateSubscription = null;

    @wire(MessageContext)
    messageContext;

    connectedCallback() {
        this.updateSubscription = subscribe(
            this.messageContext,
            TRANSACTION_UPDATED_CHANNEL,
            () => {
                this.refreshData();
            },
            { scope: APPLICATION_SCOPE } 
        );
        
        this.loadMoreData();
    }

    refreshData() {
        this.transactions = [];
        this.currentPage = 1;
        this.totalRecords = 0;
        this.enableInfiniteLoading = true;
        this.loadMoreData();
    }

    loadMoreData(event) {
        if (this.isLoading) return;
        
        const dataTable = event ? event.target : null;
        
        this.isLoading = true;
        if (dataTable) { dataTable.isLoading = true; }

        getPaginatedTransactions({ 
            pageSize: this.pageSize, 
            pageNumber: this.currentPage, 
            filtersJSON: this.filtersJSON, 
            sortsJSON: this.sortsJSON 
        })
        .then(result => {
            this.totalRecords = result.totalItemCount;
            this.transactions = [...this.transactions, ...result.records];
            
            if (this.transactions.length >= this.totalRecords) {
                this.enableInfiniteLoading = false;
            }

            this.currentPage++;
            this.isLoading = false;
            
            if (dataTable) { dataTable.isLoading = false; }
        })
        .catch(error => {
            this.isLoading = false;
            if (dataTable) { dataTable.isLoading = false; }
        });
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