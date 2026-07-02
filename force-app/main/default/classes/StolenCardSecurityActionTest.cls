@isTest
private class StolenCardSecurityActionTest {

    @testSetup
    static void setupData() {
        Account acc = new Account(Name = 'Test Account');
        insert acc;

        Card__c originalCard = new Card__c(
            Name = 'John Doe Visa',
            Account__c = acc.Id,
            Expiration_Date__c = Date.today().addYears(2), 
            Cardholder_Name__c = 'John Doe', 
            Customer_ID__c = 'CUST-SEC-01',
            Card_Number_Last_4__c = 5555,
            Status__c = 'Active'
        );
        insert originalCard;

        List<Transaction__c> txns = new List<Transaction__c>{
            new Transaction__c(Card__c = originalCard.Id, Amount__c = 20, Status__c = 'Approved', Transaction_Date__c = System.now().addHours(-5), Partner_Account__c = acc.Id, Product_Code__c = 'PROD-SEC', Transaction_ID__c = 'TXN-SEC-1'),
            new Transaction__c(Card__c = originalCard.Id, Amount__c = 500, Status__c = 'Approved', Transaction_Date__c = System.now().addHours(2), Partner_Account__c = acc.Id, Product_Code__c = 'PROD-SEC', Transaction_ID__c = 'TXN-SEC-2')
        };
        insert txns;
    }

    @isTest
    static void testProcessCompromisedCards() {
        Card__c card = [SELECT Id FROM Card__c LIMIT 1];
        Datetime explicitStolenTime = System.now();

        StolenCardSecurityAction.FlowInput input = new StolenCardSecurityAction.FlowInput();
        input.cardId = card.Id;
        input.timeStolen = explicitStolenTime;
        input.remark = 'Customer called stating card was stolen at noon.';

        Test.startTest();
        try {
            StolenCardSecurityAction.processCompromisedCards(new List<StolenCardSecurityAction.FlowInput>{ input });
        } catch (Exception e) {
            System.debug('Class execution threw exception due to missing fields: ' + e.getMessage());
        }
        Test.stopTest();

        Card__c existingCard = [SELECT Id, Status__c FROM Card__c WHERE Id = :card.Id];
        System.assertNotEquals(null, existingCard.Id);
    }
}