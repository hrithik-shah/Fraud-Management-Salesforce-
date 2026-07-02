public with sharing class StolenCardSecurityAction {
    
    public class FlowInput {
        @InvocableVariable(label='Card Record ID' required=true)
        public Id cardId;
        
        @InvocableVariable(label='Date/Time Stolen' required=true)
        public Datetime timeStolen;
        
        @InvocableVariable(label='Employee Remarks' required=false)
        public String remark;
    }

    @InvocableMethod(label='Secure Card & Issue Replacement' description='Locks card, creates a case, and issues a 30-day temporary card.')
    public static void processCompromisedCards(List<FlowInput> requests) {
        
        List<Card__c> cardsToUpdate = new List<Card__c>();
        List<Case> casesToInsert = new List<Case>();
        List<Card__c> tempCardsToInsert = new List<Card__c>();
        List<Transaction__c> txnsToUpdate = new List<Transaction__c>(); 
        
        Set<Id> cardIds = new Set<Id>();
        Map<Id, Datetime> cardStolenTimeMap = new Map<Id, Datetime>(); 
        
        for(FlowInput req : requests) {
            cardIds.add(req.cardId);
            cardStolenTimeMap.put(req.cardId, req.timeStolen);
        }
        
        Map<Id, Card__c> cardMap = new Map<Id, Card__c>([
            SELECT Id, Name, Account__c, Customer_ID__c, Card_Number_Last_4__c, Status__c 
            FROM Card__c 
            WHERE Id IN :cardIds
        ]);
        
        for(FlowInput req : requests) {
            Card__c originalCard = cardMap.get(req.cardId);
            if(originalCard == null) continue;
            
            originalCard.Status__c = 'Locked'; 
            cardsToUpdate.add(originalCard);
            
            Case newCase = new Case(
                AccountId = originalCard.Account__c,
                Subject = 'Stolen Card Report: ****-' + originalCard.Card_Number_Last_4__c,
                Description = 'Reported Stolen At: ' + req.timeStolen + '\n\nEmployee Remarks:\n' + req.remark,
                Status = 'New',
                Origin = 'Phone',
                Reported_Time__c = req.timeStolen
            );
            casesToInsert.add(newCase);

            Integer uniqueLast4 = Math.mod(Math.abs(Crypto.getRandomInteger()), 9000) + 1000;
            
            Card__c tempCard = new Card__c(
                Name = 'TEMP - ' + originalCard.Name,
                Account__c = originalCard.Account__c,
                Customer_ID__c = originalCard.Customer_ID__c,
                Original_Card__c = originalCard.Id,
                Card_Number_Last_4__c = uniqueLast4,
                Expiration_Date__c = Date.today().addDays(30),
                Status__c = 'Active'
            );
            tempCardsToInsert.add(tempCard);
        }
        
        for(Transaction__c txn : [
            SELECT Id, Card__c, Transaction_Date__c, Status__c 
            FROM Transaction__c 
            WHERE Card__c IN :cardIds 
        ]) {
            Datetime stolenTime = cardStolenTimeMap.get(txn.Card__c);
            
            if (stolenTime != null && txn.Transaction_Date__c >= stolenTime && txn.Status__c != 'Fraudulent') {
                txn.Status__c = 'Fraudulent';
                txnsToUpdate.add(txn);
            }
        }
        
        if(!cardsToUpdate.isEmpty()) update cardsToUpdate;
        if(!casesToInsert.isEmpty()) insert casesToInsert;
        if(!tempCardsToInsert.isEmpty()) insert tempCardsToInsert;
        if(!txnsToUpdate.isEmpty()) update txnsToUpdate;
    }
}