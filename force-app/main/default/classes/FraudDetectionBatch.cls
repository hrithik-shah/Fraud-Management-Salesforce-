global class FraudDetectionBatch implements Database.Batchable<sObject>, Schedulable {

    global void execute(SchedulableContext SC) {
        Database.executeBatch(new FraudDetectionBatch(), 50);
    }

    global Database.QueryLocator start(Database.BatchableContext BC) {
        return Database.getQueryLocator([
            SELECT Id, Status__c, 
                (SELECT Id, Status__c, Amount__c FROM Transactions__r WHERE CreatedDate = TODAY)
            FROM Card__c 
            WHERE Id IN (SELECT Card__c FROM Transaction__c WHERE CreatedDate = TODAY)
        ]);
    }

    global void execute(Database.BatchableContext BC, List<Card__c> scope) {
        List<Card__c> cardsToFlag = new List<Card__c>();
        
        Integer FRAUD_REJECT_LIMIT = 2;       // Rule 1: How many partner rejections trigger a flag?
        Integer HIGH_AMOUNT_LIMIT = 2;        // Rule 2: How many statistical anomalies trigger a flag?

        for(Card__c card : scope) {
            if(card.Status__c == 'Flagged') continue; 

            List<Transaction__c> history = [
                SELECT Amount__c 
                FROM Transaction__c 
                WHERE Card__c = :card.Id AND CreatedDate < TODAY 
                ORDER BY CreatedDate DESC 
                LIMIT 100
            ];

            List<Decimal> sortedAmounts = new List<Decimal>();
            for(Transaction__c hTxn : history) {
                sortedAmounts.add(hTxn.Amount__c);
            }
            sortedAmounts.sort(); 

            Decimal upperBound = 0; 

            if(sortedAmounts.size() >= 4) { 
                Integer n = sortedAmounts.size();
                
                Decimal q1 = sortedAmounts[Math.floor(n * 0.25).intValue()];
                Decimal q3 = sortedAmounts[Math.floor(n * 0.75).intValue()];
                
                Decimal iqr = q3 - q1;
                
                upperBound = q3 + (3.0 * iqr); 
            }

            Integer fraudRejects = 0;
            Integer statisticalAnomalies = 0;

            for(Transaction__c txn : card.Transactions__r) {
                
                if(txn.Status__c == 'Fraudulent') { 
                    fraudRejects++;
                }
                
                if(upperBound > 0 && txn.Amount__c > upperBound) {
                    statisticalAnomalies++;
                } 
            }

            if(fraudRejects >= FRAUD_REJECT_LIMIT || statisticalAnomalies >= HIGH_AMOUNT_LIMIT) {
                card.Status__c = 'Flagged'; 
                cardsToFlag.add(card);
            }
        }

        if(!cardsToFlag.isEmpty()) {
            update cardsToFlag;
        }
    }

    // 4. FINISH
    global void finish(Database.BatchableContext BC) {
        System.debug('✅ Memory-Optimized Daily IQR Fraud Detection Completed.');
    }
}