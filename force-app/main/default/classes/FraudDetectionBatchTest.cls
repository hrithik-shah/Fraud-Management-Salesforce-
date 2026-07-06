@isTest
private class FraudDetectionBatchTest {

    @isTest
    static void testFraudDetectionBatchExecution() {
        Account acc = new Account(Name = 'Test Account');
        insert acc;

        Card__c testCard = new Card__c(
            Name = 'Fraud Test Card', 
            Status__c = 'Active', 
            Expiration_Date__c = Date.today().addYears(2), 
            Cardholder_Name__c = 'Fraud User', 
            Card_Number_Last_4__c = 4444, 
            Customer_ID__c = 'CUST-999'
        );
        insert testCard;

        List<Transaction__c> historicalTxns = new List<Transaction__c>();
        Decimal[] amounts = new Decimal[]{10.0, 12.0, 11.0, 13.0, 14.0, 15.0};
        
        Integer i = 0;
        for (Decimal amt : amounts) {
            historicalTxns.add(new Transaction__c(
                Card__c = testCard.Id,
                Amount__c = amt,
                Status__c = 'Approved',
                Transaction_Date__c = System.now().addDays(-2),
                Partner_Account__c = acc.Id,
                Product_Code__c = 'PROD-A',
                Transaction_ID__c = 'TXN-HIST-' + i++
            ));
        }
        insert historicalTxns;

        for (Transaction__c t : historicalTxns) {
            Test.setCreatedDate(t.Id, System.now().addDays(-2));
        }

        List<Transaction__c> todaysTxns = new List<Transaction__c>{
            new Transaction__c(Card__c = testCard.Id, Amount__c = 10.0, Status__c = 'Approved', Transaction_Date__c = System.now(), Partner_Account__c = acc.Id, Product_Code__c = 'PROD-A', Transaction_ID__c = 'TXN-TODAY-1'),
            new Transaction__c(Card__c = testCard.Id, Amount__c = 11.0, Status__c = 'Approved', Transaction_Date__c = System.now(), Partner_Account__c = acc.Id, Product_Code__c = 'PROD-A', Transaction_ID__c = 'TXN-TODAY-2')
        };
        insert todaysTxns;

        Test.startTest();
        FraudDetectionBatch batchJob = new FraudDetectionBatch();
        Database.executeBatch(batchJob, 50);
        Test.stopTest();

        Card__c updatedCard = [SELECT Status__c FROM Card__c WHERE Id = :testCard.Id];
        System.assertEquals('Active', updatedCard.Status__c);
    }

    @isTest
    static void testSchedulableExecution() {
        Test.startTest();
        String cronExpr = '0 0 1 * * ?';
        String jobId = System.schedule('Test Fraud Detection Batch Cron', cronExpr, new FraudDetectionBatch());
        Test.stopTest();

        System.assertNotEquals(null, jobId);
    }
}