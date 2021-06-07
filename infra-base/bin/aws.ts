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
  const stackName = process.env.STACK_NAME? process.env.STACK_NAME : 'wbStack';
  const stack = new AwsStack(app, stackName, {}); 
  if (!stack.services || stack.services.length <= 0) throw new Error('ServiceName must be valid!');

  switch (arg) {

    case EStep['STEP0 - BUILD_INITIAL_INFRA']:
      await stack.mapEnvironments();
      await stack.buildClusterAndVPC();
      break;

    case EStep['STEP1 - BUILD_ECR_SERVICE']:
      stack.mapEnvironments();
      stack.buildClusterAndVPC();
      stack.buildECRS();
      console.warn(`Now push one image to ECR!`)
      break;

    case EStep['STEP OPTIONAL - BUILD_REDIS_ELASTIC_CACHE']:
      stack.mapEnvironments();
      stack.buildClusterAndVPC();
      stack.buildECRS();
      console.warn(`Now push one image to ECR!`)
      stack.buildRedisCache();
      break

    case EStep['STEP2 - BUILD_ECS_FARGATE_SERVICES']:
      stack.mapEnvironments();
      stack.buildClusterAndVPC();
      stack.buildECRS();
      console.warn(`Now push one image to ECR!`)
      stack.buildRedisCache();
      //FIXME verify if There is a image in repository before creates a Fargate
      stack.buildECS_APP_LoadBalanced_SERVICES();
      break;

    default:
      break;
  }

  app.synth();

}


