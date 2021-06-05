import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';

import * as ecr from '@aws-cdk/aws-ecr';

import * as ecs_patterns from "@aws-cdk/aws-ecs-patterns";

import {LifecycleRule, TagStatus} from '@aws-cdk/aws-ecr';

import * as dotenv from 'dotenv'
import { ApplicationLoadBalancedFargateService } from '@aws-cdk/aws-ecs-patterns';
import { getParam } from './util';
import { TaskDefinition } from '@aws-cdk/aws-ecs';

dotenv.config();

export interface IENVIRONMENTS {
  DATABASE_URI: string;
  API_GERAL_TOKEN: string;
  PORT: string;
  CPU_LIMIT: string;
  MEMORY_LIMIT: string;
  DESIRED_COUNT: string;
  NEW_RELIC_ENABLED: string;
  REDIS_HOST: string;
  REDIS_PORT: string;
  REDIS_KEYPREFIX: string;
  REDIS_TTL_EXPIRE: string;
}

interface ILoadEEnvParameters {
  SERVICE_NAME:string
}

export class AwsStack extends cdk.Stack {
  vpc: ec2.Vpc;
  cluster: ecs.Cluster;
  repositories: Map<string, ecr.Repository> = new Map();
  appLoadBalenced: Map<string, ApplicationLoadBalancedFargateService> = new Map();
  services: string[] = [];
  environmentService: string;
  envsParameters: IENVIRONMENTS;

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    
    this.environmentService = process.env.ENVIRONMENT!=='production' ? 'dev': 'prod';
    const SERVICES = process.env.SERVICES ? JSON.parse(process.env.SERVICES): null;
    this.services = SERVICES;

    // Stack básica VPC e Cluster ECS
    this.vpc = new ec2.Vpc(this, `${this.environmentService}-VPC`, {
      maxAzs: 2
    });

    this.cluster = new ecs.Cluster(this, `wb-${this.environmentService}-cluster`, {
      vpc: this.vpc,
      clusterName: `wb-${this.environmentService}-cluster`,
    });

  }

  public async loadEnvironments ({SERVICE_NAME}: ILoadEEnvParameters): Promise<IENVIRONMENTS>{
    const prefixPath = `/${this.environmentService}/${SERVICE_NAME}`;

    console.info({prefixPath});
    
    const envs: IENVIRONMENTS = {
      CPU_LIMIT: String(await getParam(`${prefixPath}/CPU_LIMIT`)),
      MEMORY_LIMIT: String(await getParam(`${prefixPath}/MEMORY_LIMIT`)),
      DESIRED_COUNT: String(await getParam(`${prefixPath}/DESIRED_COUNT`)),

      PORT: String(await getParam(`${prefixPath}/APP_PORT`)),
      DATABASE_URI: String(await getParam(`${prefixPath}/DATABASE_URI`)),

      API_GERAL_TOKEN : String(await getParam(`/${this.environmentService}/API_GERAL_TOKEN`)),
      NEW_RELIC_ENABLED: String(await getParam(`${prefixPath}/NEW_RELIC_ENABLED`)),
      REDIS_HOST: String(await getParam(`/${this.environmentService}/REDIS_HOST`)),
      REDIS_PORT: String(await getParam(`/${this.environmentService}/REDIS_PORT`)),
      REDIS_KEYPREFIX: `${SERVICE_NAME}-cache`,
      REDIS_TTL_EXPIRE: String(await getParam(`${prefixPath}/REDIS_TTL_EXPIRE`)),

    };

    console.info({envs})

    return envs;
  }

  public async buildServices() {
    if (this.services && this.services.length>0) {
      for (let index = 0; index < this.services.length; index++) {
        const service = this.services[index];
        
        console.info(service);
        this.envsParameters = await this.loadEnvironments(
          {
            SERVICE_NAME:service
          });


        const newRepo = new ecr.Repository(this, `${service}_repo`, {
          imageScanOnPush: false,
          imageTagMutability: ecr.TagMutability.MUTABLE,
          repositoryName: `${service}_repo`,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
          lifecycleRules: [
            {
              description: 'Mantem somente 2 imagens no repositório',
              maxImageCount: 2, //FIXME pegar do parameter store
              tagStatus: TagStatus.UNTAGGED,
            }
          ]
        });

       this.repositories.set(service, newRepo); 

        const appLoadBalanced = new ecs_patterns.ApplicationLoadBalancedFargateService(this, service, {
          cluster: this.cluster, // Required
          cpu: Number(this.envsParameters.CPU_LIMIT), // Default is 256
          desiredCount: Number(this.envsParameters.DESIRED_COUNT), // Default is 1
          taskImageOptions: { 
            image: ecs.ContainerImage.fromEcrRepository(newRepo) ,
            environment: this.envsParameters as unknown as {
              [key: string]: string;
            },
            containerPort: Number(this.envsParameters.PORT),
          },
          serviceName: service,
          deploymentController: {type: ecs.DeploymentControllerType.ECS},
          memoryLimitMiB: Number(this.envsParameters.MEMORY_LIMIT), // Default is 512
          publicLoadBalancer: true // Default is false
          
        });
        
        this.appLoadBalenced.set(service,appLoadBalanced);
      }
    }
  }

}
