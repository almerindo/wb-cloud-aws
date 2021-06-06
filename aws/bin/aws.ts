#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { AwsStack } from '../lib/aws-stack';


export enum EStep {
  'STEP0 - BUILD_INITIAL_INFRA',
  'STEP1 - BUILD_ECR_SERVICE',
  'STEP2 - BUILD_ECS_FARGATE_SERVICES',
  'STEP OPTIONAL - BUILD_REDIS_ELASTIC_CACHE',

}
export const proccessInfra = async (arg: EStep) => {
  
  const app = new cdk.App();
  const stack = new AwsStack(app, 'WhiteBeardStack', {}); //FIXME pegar do env
  if (!stack.serviceName) throw new Error('ServiceName must be valid!');

  switch (arg) {
    
    case EStep['STEP0 - BUILD_INITIAL_INFRA']:
        await stack.loadEnvironments({SERVICE_NAME:stack.serviceName});
        await stack.buildClusterAndVPC();  
      break;
    
    case EStep['STEP1 - BUILD_ECR_SERVICE']:
        stack.loadEnvironments({SERVICE_NAME:stack.serviceName});
        stack.buildClusterAndVPC();
        stack.buildECR({SERVICE_NAME:stack.serviceName});  
        console.warn(`Now push one image to ECR!`)
      break;
  
    case EStep['STEP2 - BUILD_ECS_FARGATE_SERVICES']:
        stack.loadEnvironments({SERVICE_NAME:stack.serviceName});
        stack.buildClusterAndVPC();
        stack.buildECR({SERVICE_NAME:stack.serviceName}); 
        //FIXME verify if There is a image in repository before creates a Fargate
        stack.buildECS_APP_LoadBalanced({SERVICE_NAME:stack.serviceName});
      break;


    case EStep['STEP OPTIONAL - BUILD_REDIS_ELASTIC_CACHE']:
        stack.loadEnvironments({SERVICE_NAME:stack.serviceName});
        stack.buildClusterAndVPC();
        stack.buildRedisCache();
      break
  
    default:
      break;
  }

  app.synth();
  
}


