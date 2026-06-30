public with sharing class PartnerTransactionController {
    
    @AuraEnabled(cacheable=true)
    public static List<Transaction__c> getPendingTransactions() {
        return [
            SELECT Id, Name, Transaction_ID__c, Amount__c, Transaction_Date__c, Status__c, Product_Code__c, Store_Location__c
            FROM Transaction__c
            WHERE Status__c = 'Pending'
            ORDER BY Transaction_Date__c ASC
        ];
    }

    @AuraEnabled(cacheable=true)
    public static List<Transaction__c> getProcessedTransactions() {
        return [
            SELECT Id, Name, Transaction_ID__c, Amount__c, Transaction_Date__c, Status__c, Product_Code__c, Store_Location__c
            FROM Transaction__c
            WHERE Status__c <> 'Pending'
            ORDER BY LastModifiedDate DESC
        ];
    }

    @AuraEnabled
    public static void updateTransactionStatuses(List<Id> transactionIds, String newStatus) {
        List<Transaction__c> txnsToUpdate = new List<Transaction__c>();
        for(Id txnId : transactionIds) {
            txnsToUpdate.add(new Transaction__c(
                Id = txnId, 
                Status__c = newStatus
            ));
        }
        
        if(!txnsToUpdate.isEmpty()) {
            update txnsToUpdate;
        }
    }
}